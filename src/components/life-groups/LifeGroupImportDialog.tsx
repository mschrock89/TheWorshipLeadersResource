import { useMemo, useRef, useState } from "react";
import type { DragEvent } from "react";
import { AlertCircle, CheckCircle2, FileSpreadsheet, Loader2, Upload, X } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import {
  AppRole,
  LifeGroup,
  LifeGroupBaseRoleAssignment,
  LifeGroupGrade,
  LifeGroupMutationInput,
  LifeGroupPerson,
  useImportLifeGroups,
} from "@/hooks/useLifeGroups";
import { Profile } from "@/hooks/useProfiles";
import { ROLE_LABELS } from "@/lib/constants";
import { ParsedLifeGroupDraft, parseLifeGroupImportFile } from "@/lib/lifeGroupImport";
import { cn } from "@/lib/cn";

interface LifeGroupImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  campusId: string | null;
  profiles: Profile[];
  existingGroups: LifeGroup[];
  meetingLocations: string[];
  gradeOptions: LifeGroupGrade[];
}

interface MatchedName {
  name: string;
  profile: Profile | null;
}

interface ResolvedDraft {
  draft: ParsedLifeGroupDraft;
  existingGroup: LifeGroup | null;
  leaderMatches: MatchedName[];
  studentMatches: MatchedName[];
}

const ACCEPTED_FILE_TYPES = ".csv,.tsv,.txt,.pdf,.xlsx";
const NO_ROLE_ASSIGNMENT = "none";
const LIFE_GROUP_BASE_ROLE_OPTIONS = ["student", "ms_leader", "ms_leader_weekend", "hs_leader"] as const;

type LifeGroupImportBaseRole = Extract<AppRole, (typeof LIFE_GROUP_BASE_ROLE_OPTIONS)[number]>;
type LifeGroupImportRoleValue = LifeGroupImportBaseRole | typeof NO_ROLE_ASSIGNMENT;

function getDefaultLeaderBaseRole(gradeOptions: LifeGroupGrade[]): LifeGroupImportBaseRole {
  return gradeOptions.includes(8) && gradeOptions.length === 1 ? "ms_leader" : "hs_leader";
}

function getRoleAssignmentLabel(role: LifeGroupImportRoleValue) {
  return role === NO_ROLE_ASSIGNMENT ? "Do not update" : ROLE_LABELS[role] || role;
}

function normalizeName(value: string | null | undefined) {
  return (value || "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

function nameAliases(value: string | null | undefined) {
  const cleaned = (value || "").replace(/\s+/g, " ").trim();
  const aliases = new Set<string>();
  aliases.add(normalizeName(cleaned));

  if (cleaned.includes(",")) {
    const [last, first] = cleaned.split(",").map((part) => part.trim());
    if (first && last) aliases.add(normalizeName(`${first} ${last}`));
  }

  const parts = cleaned.split(" ").filter(Boolean);
  if (parts.length >= 2) {
    aliases.add(normalizeName(`${parts[0]} ${parts[parts.length - 1]}`));
  }

  return Array.from(aliases).filter(Boolean);
}

function personLabel(person: LifeGroupPerson | Profile) {
  return person.full_name || "Unnamed";
}

function buildProfileIndex(profiles: Profile[]) {
  const index = new Map<string, Profile>();

  profiles.forEach((profile) => {
    nameAliases(profile.full_name).forEach((alias) => {
      if (!index.has(alias)) index.set(alias, profile);
    });
  });

  return index;
}

function matchImportedNames(names: string[], profileIndex: Map<string, Profile>) {
  return names.map((name) => {
    const profile = nameAliases(name)
      .map((alias) => profileIndex.get(alias))
      .find(Boolean) || null;

    return { name, profile };
  });
}

function formatNames(matches: MatchedName[]) {
  const matchedNames = matches
    .filter((match) => match.profile)
    .map((match) => personLabel(match.profile as Profile));

  if (matchedNames.length === 0) return "None matched";
  if (matchedNames.length <= 2) return matchedNames.join(", ");
  return `${matchedNames.slice(0, 2).join(", ")} +${matchedNames.length - 2}`;
}

function unmatchedNames(matches: MatchedName[]) {
  return matches.filter((match) => !match.profile).map((match) => match.name);
}

function buildBaseRoleAssignments(
  drafts: ResolvedDraft[],
  leaderBaseRole: LifeGroupImportRoleValue,
  studentBaseRole: LifeGroupImportRoleValue,
) {
  const assignments = new Map<string, LifeGroupImportBaseRole>();

  if (studentBaseRole !== NO_ROLE_ASSIGNMENT) {
    drafts.forEach((item) => {
      item.studentMatches.forEach((match) => {
        if (match.profile) assignments.set(match.profile.id, studentBaseRole);
      });
    });
  }

  if (leaderBaseRole !== NO_ROLE_ASSIGNMENT) {
    drafts.forEach((item) => {
      item.leaderMatches.forEach((match) => {
        if (match.profile) assignments.set(match.profile.id, leaderBaseRole);
      });
    });
  }

  return Array.from(assignments, ([userId, role]) => ({ userId, role })) satisfies LifeGroupBaseRoleAssignment[];
}

export function LifeGroupImportDialog({
  open,
  onOpenChange,
  campusId,
  profiles,
  existingGroups,
  meetingLocations,
  gradeOptions,
}: LifeGroupImportDialogProps) {
  const { toast } = useToast();
  const importLifeGroups = useImportLifeGroups();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [drafts, setDrafts] = useState<ParsedLifeGroupDraft[]>([]);
  const [leaderBaseRole, setLeaderBaseRole] = useState<LifeGroupImportRoleValue>(() => getDefaultLeaderBaseRole(gradeOptions));
  const [studentBaseRole, setStudentBaseRole] = useState<LifeGroupImportRoleValue>("student");
  const [isParsing, setIsParsing] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);

  const profileIndex = useMemo(() => buildProfileIndex(profiles), [profiles]);
  const existingGroupsByName = useMemo(() => {
    const groupsByName = new Map<string, LifeGroup>();
    existingGroups.forEach((group) => {
      groupsByName.set(normalizeName(group.name), group);
    });
    return groupsByName;
  }, [existingGroups]);

  const resolvedDrafts = useMemo<ResolvedDraft[]>(() => {
    return drafts.map((draft) => ({
      draft,
      existingGroup: existingGroupsByName.get(normalizeName(draft.name)) || null,
      leaderMatches: matchImportedNames(draft.leaderNames, profileIndex),
      studentMatches: matchImportedNames(draft.studentNames, profileIndex),
    }));
  }, [drafts, existingGroupsByName, profileIndex]);

  const unmatchedCount = resolvedDrafts.reduce(
    (count, item) => count + unmatchedNames(item.leaderMatches).length + unmatchedNames(item.studentMatches).length,
    0,
  );
  const matchedCount = resolvedDrafts.reduce(
    (count, item) =>
      count + item.leaderMatches.filter((match) => match.profile).length + item.studentMatches.filter((match) => match.profile).length,
    0,
  );
  const updateCount = resolvedDrafts.filter((item) => item.existingGroup).length;
  const unsupportedGradeDrafts = resolvedDrafts.filter((item) => !gradeOptions.includes(item.draft.gradeLevel));
  const allowedGradeLabel = gradeOptions.map((grade) => `${grade}th`).join(", ");
  const baseRoleAssignments = useMemo(
    () => buildBaseRoleAssignments(resolvedDrafts, leaderBaseRole, studentBaseRole),
    [leaderBaseRole, resolvedDrafts, studentBaseRole],
  );

  const resetState = () => {
    setFile(null);
    setDrafts([]);
    setLeaderBaseRole(getDefaultLeaderBaseRole(gradeOptions));
    setStudentBaseRole("student");
    setIsParsing(false);
    setParseError(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) resetState();
    onOpenChange(nextOpen);
  };

  const handleFileSelect = async (selectedFile: File) => {
    setFile(selectedFile);
    setDrafts([]);
    setParseError(null);
    setIsParsing(true);

    try {
      const parsedDrafts = await parseLifeGroupImportFile(selectedFile);
      setDrafts(parsedDrafts);

      if (parsedDrafts.length === 0) {
        setParseError("No groups were found. Try a file with group, leader, student, grade, gender, and location columns.");
        return;
      }

      toast({
        title: "Upload parsed",
        description: `Found ${parsedDrafts.length} life group${parsedDrafts.length === 1 ? "" : "s"} to review.`,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to parse this file.";
      setParseError(message);
      setFile(null);
      toast({
        title: "Couldn't parse upload",
        description: message,
        variant: "destructive",
      });
    } finally {
      setIsParsing(false);
    }
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    const droppedFile = event.dataTransfer.files[0];
    if (droppedFile) void handleFileSelect(droppedFile);
  };

  const handleImport = async () => {
    const fallbackLocation = meetingLocations[0] || "Student Center";
    const inputs: LifeGroupMutationInput[] = resolvedDrafts.map((item) => ({
      id: item.existingGroup?.id,
      campus_id: item.existingGroup?.campus_id ?? campusId,
      name: item.draft.name,
      gender: item.draft.gender,
      grade_level: item.draft.gradeLevel,
      meeting_location: item.draft.meetingLocation || fallbackLocation,
      leaderIds: item.leaderMatches.flatMap((match) => (match.profile ? [match.profile.id] : [])),
      studentIds: item.studentMatches.flatMap((match) => (match.profile ? [match.profile.id] : [])),
    }));

    await importLifeGroups.mutateAsync({
      groups: inputs,
      baseRoleAssignments,
    });
    handleOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="z-[60] flex max-h-[calc(100dvh-5.5rem-env(safe-area-inset-top,0px)-env(safe-area-inset-bottom,0px))] w-[calc(100vw-1rem)] max-w-[calc(100vw-1rem)] flex-col gap-0 overflow-hidden p-0 sm:max-h-[calc(100dvh-2rem)] sm:w-full sm:max-w-5xl">
        <DialogHeader className="shrink-0 px-4 pb-3 pt-5 pr-10 sm:px-6 sm:pt-6">
          <DialogTitle>Import Life Groups</DialogTitle>
          <DialogDescription>
            Upload a CSV, TSV, TXT, PDF, or Excel file to create groups and match rosters to existing profiles.
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="min-h-0 flex-1 px-4 sm:px-6">
          <div className="space-y-5 pb-6">
            <div
              className={cn(
                "flex min-h-40 cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed p-6 text-center transition-colors hover:bg-muted/40",
                isParsing && "pointer-events-none opacity-70",
              )}
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(event) => event.preventDefault()}
              onDrop={handleDrop}
            >
              {isParsing ? (
                <Loader2 className="h-9 w-9 animate-spin text-primary" />
              ) : (
                <Upload className="h-9 w-9 text-muted-foreground" />
              )}
              <p className="mt-3 font-medium">{file ? file.name : "Drop a file here or choose one"}</p>
              <p className="mt-1 text-sm text-muted-foreground">Accepted: CSV, TSV, TXT, PDF, XLSX</p>
              <input
                ref={fileInputRef}
                type="file"
                accept={ACCEPTED_FILE_TYPES}
                className="hidden"
                onChange={(event) => {
                  const selectedFile = event.target.files?.[0];
                  if (selectedFile) void handleFileSelect(selectedFile);
                }}
              />
            </div>

            {parseError && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{parseError}</AlertDescription>
              </Alert>
            )}

            {resolvedDrafts.length > 0 && (
              <>
                <div className="grid gap-3 sm:grid-cols-4">
                  <div className="rounded-md border p-3">
                    <p className="text-2xl font-semibold">{resolvedDrafts.length}</p>
                    <p className="text-xs text-muted-foreground">Groups found</p>
                  </div>
                  <div className="rounded-md border p-3">
                    <p className="text-2xl font-semibold">{updateCount}</p>
                    <p className="text-xs text-muted-foreground">Will update</p>
                  </div>
                  <div className="rounded-md border p-3">
                    <p className="text-2xl font-semibold">{matchedCount}</p>
                    <p className="text-xs text-muted-foreground">People matched</p>
                  </div>
                  <div className="rounded-md border p-3">
                    <p className="text-2xl font-semibold">{unmatchedCount}</p>
                    <p className="text-xs text-muted-foreground">Need profile match</p>
                  </div>
                </div>

                <div className="rounded-md border p-4">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
                    <div>
                      <p className="text-sm font-medium">Base role assignment</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {baseRoleAssignments.length} matched profile{baseRoleAssignments.length === 1 ? "" : "s"} will be updated.
                      </p>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2 lg:w-[520px]">
                      <div className="space-y-1.5">
                        <p className="text-xs font-medium text-muted-foreground">Leaders</p>
                        <Select
                          value={leaderBaseRole}
                          onValueChange={(value) => setLeaderBaseRole(value as LifeGroupImportRoleValue)}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Leader role" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value={NO_ROLE_ASSIGNMENT}>{getRoleAssignmentLabel(NO_ROLE_ASSIGNMENT)}</SelectItem>
                            {LIFE_GROUP_BASE_ROLE_OPTIONS.map((role) => (
                              <SelectItem key={role} value={role}>
                                {getRoleAssignmentLabel(role)}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1.5">
                        <p className="text-xs font-medium text-muted-foreground">Students</p>
                        <Select
                          value={studentBaseRole}
                          onValueChange={(value) => setStudentBaseRole(value as LifeGroupImportRoleValue)}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Student role" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value={NO_ROLE_ASSIGNMENT}>{getRoleAssignmentLabel(NO_ROLE_ASSIGNMENT)}</SelectItem>
                            {LIFE_GROUP_BASE_ROLE_OPTIONS.map((role) => (
                              <SelectItem key={role} value={role}>
                                {getRoleAssignmentLabel(role)}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  </div>
                </div>

                {unmatchedCount > 0 && (
                  <Alert>
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>
                      Unmatched names will be skipped. Create or rename profiles first if they should be added to a roster.
                    </AlertDescription>
                  </Alert>
                )}

                {unsupportedGradeDrafts.length > 0 && (
                  <Alert variant="destructive">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>
                      This app only accepts {allowedGradeLabel} Life Groups. Remove {unsupportedGradeDrafts.length} unsupported group
                      {unsupportedGradeDrafts.length === 1 ? "" : "s"} from the upload before importing.
                    </AlertDescription>
                  </Alert>
                )}

                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Group</TableHead>
                        <TableHead>Details</TableHead>
                        <TableHead>Leaders</TableHead>
                        <TableHead>Students</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {resolvedDrafts.map((item) => {
                        const leaderUnmatched = unmatchedNames(item.leaderMatches);
                        const studentUnmatched = unmatchedNames(item.studentMatches);
                        return (
                          <TableRow key={`${item.draft.sourceLabel}-${item.draft.name}`}>
                            <TableCell className="min-w-52 align-top">
                              <p className="font-medium">{item.draft.name}</p>
                              <p className="mt-1 text-xs text-muted-foreground">{item.draft.meetingLocation}</p>
                            </TableCell>
                            <TableCell className="align-top">
                              <div className="flex flex-wrap gap-1">
                                <Badge variant="secondary">{item.draft.gender}</Badge>
                                <Badge variant="outline">{item.draft.gradeLevel}th</Badge>
                              </div>
                            </TableCell>
                            <TableCell className="max-w-56 align-top text-sm">
                              <p>{formatNames(item.leaderMatches)}</p>
                              {leaderUnmatched.length > 0 && (
                                <p className="mt-1 text-xs text-destructive">Unmatched: {leaderUnmatched.join(", ")}</p>
                              )}
                            </TableCell>
                            <TableCell className="max-w-72 align-top text-sm">
                              <p>{formatNames(item.studentMatches)}</p>
                              {studentUnmatched.length > 0 && (
                                <p className="mt-1 text-xs text-destructive">Unmatched: {studentUnmatched.join(", ")}</p>
                              )}
                            </TableCell>
                            <TableCell className="align-top">
                              {!gradeOptions.includes(item.draft.gradeLevel) ? (
                                <Badge variant="destructive">Wrong app</Badge>
                              ) : item.existingGroup ? (
                                <Badge variant="outline">Update</Badge>
                              ) : (
                                <Badge className="gap-1">
                                  <CheckCircle2 className="h-3 w-3" />
                                  New
                                </Badge>
                              )}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              </>
            )}
          </div>
        </ScrollArea>

        <Separator className="shrink-0" />
        <DialogFooter className="shrink-0 gap-2 px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom,0px))] sm:px-6 sm:py-4">
          {file && (
            <Button type="button" variant="ghost" onClick={resetState} className="sm:mr-auto gap-2">
              <X className="h-4 w-4" />
              Clear
            </Button>
          )}
          <Button type="button" variant="outline" onClick={() => handleOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleImport} disabled={resolvedDrafts.length === 0 || unsupportedGradeDrafts.length > 0 || importLifeGroups.isPending}>
            {importLifeGroups.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileSpreadsheet className="h-4 w-4" />}
            Import Groups
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
