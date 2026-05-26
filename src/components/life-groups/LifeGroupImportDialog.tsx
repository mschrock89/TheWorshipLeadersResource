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
import { Separator } from "@/components/ui/separator";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import {
  LifeGroup,
  LifeGroupMutationInput,
  LifeGroupPerson,
  useImportLifeGroups,
} from "@/hooks/useLifeGroups";
import { Profile } from "@/hooks/useProfiles";
import { ParsedLifeGroupDraft, parseLifeGroupImportFile } from "@/lib/lifeGroupImport";
import { cn } from "@/lib/utils";

interface LifeGroupImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  campusId: string | null;
  profiles: Profile[];
  existingGroups: LifeGroup[];
  meetingLocations: string[];
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

export function LifeGroupImportDialog({
  open,
  onOpenChange,
  campusId,
  profiles,
  existingGroups,
  meetingLocations,
}: LifeGroupImportDialogProps) {
  const { toast } = useToast();
  const importLifeGroups = useImportLifeGroups();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [drafts, setDrafts] = useState<ParsedLifeGroupDraft[]>([]);
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

  const resetState = () => {
    setFile(null);
    setDrafts([]);
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

    await importLifeGroups.mutateAsync(inputs);
    handleOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-h-[92dvh] max-w-5xl overflow-hidden p-0">
        <DialogHeader className="px-6 pt-6">
          <DialogTitle>Import Life Groups</DialogTitle>
          <DialogDescription>
            Upload a CSV, TSV, TXT, PDF, or Excel file to create groups and match rosters to existing profiles.
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[calc(92dvh-10rem)] px-6">
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

                {unmatchedCount > 0 && (
                  <Alert>
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>
                      Unmatched names will be skipped. Create or rename profiles first if they should be added to a roster.
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
                              {item.existingGroup ? (
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

        <Separator />
        <DialogFooter className="px-6 py-4">
          {file && (
            <Button type="button" variant="ghost" onClick={resetState} className="mr-auto gap-2">
              <X className="h-4 w-4" />
              Clear
            </Button>
          )}
          <Button type="button" variant="outline" onClick={() => handleOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleImport} disabled={resolvedDrafts.length === 0 || importLifeGroups.isPending}>
            {importLifeGroups.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileSpreadsheet className="h-4 w-4" />}
            Import Groups
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
