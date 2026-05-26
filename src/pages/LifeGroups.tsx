import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { format, parseISO } from "date-fns";
import {
  ArrowLeft,
  CalendarDays,
  CheckCircle2,
  ClipboardCheck,
  Edit,
  Loader2,
  MapPin,
  Plus,
  Search,
  ShieldCheck,
  Trash2,
  Upload,
  UserCheck,
  UsersRound,
} from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { LifeGroupImportDialog } from "@/components/life-groups/LifeGroupImportDialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/hooks/useAuth";
import { useCampuses, useProfilesWithCampuses, useUserCampuses } from "@/hooks/useCampuses";
import {
  AttendanceStatus,
  LifeGroup,
  LifeGroupGender,
  LifeGroupGrade,
  LifeGroupPerson,
  useDeleteLifeGroup,
  useLifeGroupMeetingLocations,
  useLifeGroups,
  useSaveLifeGroup,
  useSaveLifeGroupWeeklyReport,
} from "@/hooks/useLifeGroups";
import { Profile, useProfiles } from "@/hooks/useProfiles";
import { isCurrentStudentResourceApp } from "@/lib/resourceApp";
import { cn } from "@/lib/utils";

const GRADE_OPTIONS: LifeGroupGrade[] = [8, 9, 10, 11, 12];
const GENDER_OPTIONS: Array<{ value: LifeGroupGender; label: string }> = [
  { value: "male", label: "Male" },
  { value: "female", label: "Female" },
  { value: "coed", label: "Coed" },
];

function todayInputValue() {
  const now = new Date();
  const offsetDate = new Date(now.getTime() - now.getTimezoneOffset() * 60_000);
  return offsetDate.toISOString().slice(0, 10);
}

function formatDate(value: string) {
  try {
    return format(parseISO(value), "MMM d, yyyy");
  } catch {
    return value;
  }
}

function genderLabel(gender: LifeGroupGender | string | null | undefined) {
  return GENDER_OPTIONS.find((option) => option.value === gender)?.label ?? "Not set";
}

function personName(person: LifeGroupPerson | Profile) {
  return person.full_name || "Unnamed";
}

function initials(name: string | null) {
  return (name || "?")
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function PersonPill({ person }: { person: LifeGroupPerson }) {
  return (
    <div className="flex min-w-0 items-center gap-2 rounded-md border bg-card px-2 py-1 text-sm">
      <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[10px] font-semibold text-primary">
        {initials(person.full_name)}
      </div>
      <span className="truncate">{personName(person)}</span>
    </div>
  );
}

function sortProfiles(profiles: Profile[]) {
  return [...profiles].sort((a, b) => personName(a).localeCompare(personName(b)));
}

interface LifeGroupDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  group: LifeGroup | null;
  campusId: string | null;
  profiles: Profile[];
  meetingLocations: string[];
}

function LifeGroupDialog({
  open,
  onOpenChange,
  group,
  campusId,
  profiles,
  meetingLocations,
}: LifeGroupDialogProps) {
  const saveLifeGroup = useSaveLifeGroup();
  const [name, setName] = useState("");
  const [gender, setGender] = useState<LifeGroupGender>("female");
  const [gradeLevel, setGradeLevel] = useState<LifeGroupGrade>(8);
  const [location, setLocation] = useState("Student Center");
  const [customLocation, setCustomLocation] = useState("");
  const [leaderIds, setLeaderIds] = useState<string[]>([]);
  const [studentIds, setStudentIds] = useState<string[]>([]);
  const [leaderSearch, setLeaderSearch] = useState("");
  const [studentSearch, setStudentSearch] = useState("");

  useEffect(() => {
    if (!open) return;

    setName(group?.name || "");
    setGender(group?.gender || "female");
    setGradeLevel(group?.grade_level || 8);
    setLocation(group?.meeting_location || "Student Center");
    setCustomLocation("");
    setLeaderIds(group?.leaders.map((leader) => leader.id) || []);
    setStudentIds(group?.students.map((student) => student.id) || []);
    setLeaderSearch("");
    setStudentSearch("");
  }, [group, open]);

  const selectedLocation = location === "__custom__" ? customLocation : location;
  const searchableProfiles = useMemo(() => sortProfiles(profiles), [profiles]);

  const filteredLeaders = useMemo(() => {
    const query = leaderSearch.trim().toLowerCase();
    return searchableProfiles.filter((profile) => personName(profile).toLowerCase().includes(query));
  }, [leaderSearch, searchableProfiles]);

  const filteredStudents = useMemo(() => {
    const query = studentSearch.trim().toLowerCase();
    return searchableProfiles.filter((profile) => {
      if (leaderIds.includes(profile.id)) return false;
      if (gender !== "coed" && profile.gender && profile.gender !== gender) return false;
      return personName(profile).toLowerCase().includes(query);
    });
  }, [gender, leaderIds, searchableProfiles, studentSearch]);

  const toggleId = (ids: string[], id: string) =>
    ids.includes(id) ? ids.filter((item) => item !== id) : [...ids, id];

  const handleSave = async () => {
    if (!name.trim() || !selectedLocation.trim()) return;

    await saveLifeGroup.mutateAsync({
      id: group?.id,
      campus_id: campusId,
      name,
      gender,
      grade_level: gradeLevel,
      meeting_location: selectedLocation,
      leaderIds,
      studentIds,
    });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92dvh] max-w-4xl overflow-hidden p-0">
        <DialogHeader className="px-6 pt-6">
          <DialogTitle>{group ? "Edit Life Group" : "Create Life Group"}</DialogTitle>
          <DialogDescription>Build the group, assign leaders, and place students.</DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[calc(92dvh-9rem)] px-6">
          <div className="space-y-6 pb-6">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="life-group-name">Group Name</Label>
                <Input
                  id="life-group-name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="Wednesday Girls 9th"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Gender</Label>
                  <Select value={gender} onValueChange={(value) => setGender(value as LifeGroupGender)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {GENDER_OPTIONS.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Grade</Label>
                  <Select value={String(gradeLevel)} onValueChange={(value) => setGradeLevel(Number(value) as LifeGroupGrade)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {GRADE_OPTIONS.map((grade) => (
                        <SelectItem key={grade} value={String(grade)}>
                          {grade}th
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label>Meeting Location</Label>
                <div className="grid gap-3 md:grid-cols-[1fr_240px]">
                  <Select value={location} onValueChange={setLocation}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {meetingLocations.map((item) => (
                        <SelectItem key={item} value={item}>
                          {item}
                        </SelectItem>
                      ))}
                      <SelectItem value="__custom__">Custom location</SelectItem>
                    </SelectContent>
                  </Select>
                  {location === "__custom__" && (
                    <Input
                      value={customLocation}
                      onChange={(event) => setCustomLocation(event.target.value)}
                      placeholder="Enter location"
                    />
                  )}
                </div>
              </div>
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Leaders</CardTitle>
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      value={leaderSearch}
                      onChange={(event) => setLeaderSearch(event.target.value)}
                      className="pl-9"
                      placeholder="Search leaders"
                    />
                  </div>
                </CardHeader>
                <CardContent>
                  <ScrollArea className="h-72 pr-3">
                    <div className="space-y-2">
                      {filteredLeaders.map((profile) => (
                        <label
                          key={profile.id}
                          className="flex cursor-pointer items-center gap-3 rounded-md border p-3 hover:bg-muted/50"
                        >
                          <Checkbox
                            checked={leaderIds.includes(profile.id)}
                            onCheckedChange={() => setLeaderIds((ids) => toggleId(ids, profile.id))}
                          />
                          <span className="min-w-0 flex-1 truncate text-sm font-medium">{personName(profile)}</span>
                          {profile.gender && <Badge variant="outline">{genderLabel(profile.gender)}</Badge>}
                        </label>
                      ))}
                    </div>
                  </ScrollArea>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Students</CardTitle>
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      value={studentSearch}
                      onChange={(event) => setStudentSearch(event.target.value)}
                      className="pl-9"
                      placeholder="Search students"
                    />
                  </div>
                </CardHeader>
                <CardContent>
                  <ScrollArea className="h-72 pr-3">
                    <div className="space-y-2">
                      {filteredStudents.map((profile) => (
                        <label
                          key={profile.id}
                          className="flex cursor-pointer items-center gap-3 rounded-md border p-3 hover:bg-muted/50"
                        >
                          <Checkbox
                            checked={studentIds.includes(profile.id)}
                            onCheckedChange={() => setStudentIds((ids) => toggleId(ids, profile.id))}
                          />
                          <span className="min-w-0 flex-1 truncate text-sm font-medium">{personName(profile)}</span>
                          {profile.gender && <Badge variant="outline">{genderLabel(profile.gender)}</Badge>}
                        </label>
                      ))}
                    </div>
                  </ScrollArea>
                </CardContent>
              </Card>
            </div>
          </div>
        </ScrollArea>

        <DialogFooter className="border-t px-6 py-4">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={!name.trim() || !selectedLocation.trim() || saveLifeGroup.isPending}>
            {saveLifeGroup.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            Save Group
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface WeeklyCheckInProps {
  group: LifeGroup;
  isAdmin: boolean;
  canSubmit: boolean;
}

function WeeklyCheckIn({ group, isAdmin, canSubmit }: WeeklyCheckInProps) {
  const saveReport = useSaveLifeGroupWeeklyReport();
  const [meetingDate, setMeetingDate] = useState(todayInputValue());
  const currentReport = group.reports.find((report) => report.meeting_date === meetingDate);
  const [presentStudentIds, setPresentStudentIds] = useState<string[]>([]);
  const [prayerRequests, setPrayerRequests] = useState("");
  const [feedback, setFeedback] = useState("");

  useEffect(() => {
    const attendance = currentReport?.attendance || [];
    setPresentStudentIds(attendance.filter((entry) => entry.status === "present").map((entry) => entry.student_id));
    setPrayerRequests(currentReport?.prayer_requests || "");
    setFeedback(isAdmin ? currentReport?.feedback || "" : "");
  }, [currentReport, group.id, isAdmin]);

  const presentCount = presentStudentIds.length;

  const togglePresent = (studentId: string) => {
    setPresentStudentIds((ids) =>
      ids.includes(studentId) ? ids.filter((id) => id !== studentId) : [...ids, studentId],
    );
  };

  const handleSave = async () => {
    await saveReport.mutateAsync({
      groupId: group.id,
      meetingDate,
      prayerRequests,
      feedback,
      attendance: group.students.map((student) => ({
        studentId: student.id,
        status: presentStudentIds.includes(student.id) ? "present" : "absent" as AttendanceStatus,
      })),
    });
    if (!isAdmin) setFeedback("");
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <ClipboardCheck className="h-5 w-5 text-primary" />
          Weekly Check-In
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-[220px_1fr]">
          <div className="space-y-2">
            <Label htmlFor="meeting-date">Meeting Date</Label>
            <Input
              id="meeting-date"
              type="date"
              value={meetingDate}
              onChange={(event) => setMeetingDate(event.target.value)}
            />
          </div>
          <div className="rounded-md border bg-muted/30 p-3">
            <p className="text-sm font-medium">{presentCount} of {group.students.length} present</p>
            <p className="mt-1 text-xs text-muted-foreground">{formatDate(meetingDate)}</p>
          </div>
        </div>

        <div className="space-y-3">
          <Label>Attendance</Label>
          <div className="grid gap-2 sm:grid-cols-2">
            {group.students.map((student) => (
              <label
                key={student.id}
                className={cn(
                  "flex cursor-pointer items-center gap-3 rounded-md border p-3 transition-colors",
                  presentStudentIds.includes(student.id) ? "border-primary/50 bg-primary/5" : "hover:bg-muted/50",
                )}
              >
                <Checkbox
                  checked={presentStudentIds.includes(student.id)}
                  disabled={!canSubmit}
                  onCheckedChange={() => togglePresent(student.id)}
                />
                <span className="min-w-0 flex-1 truncate text-sm font-medium">{personName(student)}</span>
              </label>
            ))}
          </div>
          {group.students.length === 0 && (
            <p className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">No students assigned yet.</p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="prayer-requests">Prayer Requests</Label>
          <Textarea
            id="prayer-requests"
            value={prayerRequests}
            disabled={!canSubmit}
            onChange={(event) => setPrayerRequests(event.target.value)}
            rows={4}
            placeholder="Add prayer requests from this week"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="leader-feedback" className="flex items-center gap-2">
            Leader Feedback
            <ShieldCheck className="h-4 w-4 text-muted-foreground" />
          </Label>
          <Textarea
            id="leader-feedback"
            value={feedback}
            disabled={!canSubmit}
            onChange={(event) => setFeedback(event.target.value)}
            rows={4}
            placeholder="Add feedback for admins"
          />
        </div>

        <div className="flex justify-end">
          <Button onClick={handleSave} disabled={!canSubmit || saveReport.isPending || group.students.length === 0}>
            {saveReport.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
            Save Weekly Check-In
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function ReportHistory({ group, isAdmin }: { group: LifeGroup; isAdmin: boolean }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <CalendarDays className="h-5 w-5 text-primary" />
          Weekly History
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {group.reports.map((report) => {
          const present = report.attendance.filter((entry) => entry.status === "present").length;
          return (
            <div key={report.id} className="rounded-lg border p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="font-medium">{formatDate(report.meeting_date)}</p>
                  <p className="text-sm text-muted-foreground">{present} of {group.students.length} present</p>
                </div>
                <Badge variant="secondary">{Math.round((present / Math.max(group.students.length, 1)) * 100)}%</Badge>
              </div>
              {report.prayer_requests && (
                <div className="mt-3 rounded-md bg-muted/40 p-3 text-sm">
                  <p className="font-medium">Prayer Requests</p>
                  <p className="mt-1 whitespace-pre-wrap text-muted-foreground">{report.prayer_requests}</p>
                </div>
              )}
              {isAdmin && report.feedback && (
                <div className="mt-3 rounded-md border border-primary/20 bg-primary/5 p-3 text-sm">
                  <p className="font-medium">Admin Feedback</p>
                  <p className="mt-1 whitespace-pre-wrap text-muted-foreground">{report.feedback}</p>
                </div>
              )}
            </div>
          );
        })}
        {group.reports.length === 0 && (
          <p className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">No weekly check-ins yet.</p>
        )}
      </CardContent>
    </Card>
  );
}

export default function LifeGroups() {
  const { user, isAdmin } = useAuth();
  const isStudentApp = isCurrentStudentResourceApp();
  const { data: allCampuses = [] } = useCampuses();
  const { data: userCampuses = [] } = useUserCampuses(user?.id);
  const { data: profileCampusMap = {} } = useProfilesWithCampuses();
  const { data: profiles = [] } = useProfiles();
  const [selectedCampusId, setSelectedCampusId] = useState<string>(() => {
    return localStorage.getItem("life-groups-campus-filter") || "all";
  });
  const { data: groups = [], isLoading } = useLifeGroups(selectedCampusId);
  const meetingLocations = useLifeGroupMeetingLocations(groups);
  const deleteLifeGroup = useDeleteLifeGroup();
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [editingGroup, setEditingGroup] = useState<LifeGroup | null>(null);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  useEffect(() => {
    if (groups.length === 0) {
      setSelectedGroupId(null);
      return;
    }

    if (!selectedGroupId || !groups.some((group) => group.id === selectedGroupId)) {
      setSelectedGroupId(groups[0].id);
    }
  }, [groups, selectedGroupId]);

  const availableCampuses = isAdmin ? allCampuses : userCampuses.map((item) => item.campuses).filter(Boolean);
  const selectedCampus = availableCampuses.find((campus) => campus?.id === selectedCampusId);
  const selectedGroup = groups.find((group) => group.id === selectedGroupId) || null;
  const canManageGroups = isStudentApp && isAdmin;
  const canSubmitSelectedGroup = !!selectedGroup && (isAdmin || selectedGroup.isCurrentUserLeader);

  const campusFilteredProfiles = useMemo(() => {
    if (selectedCampusId === "all") return profiles;
    return profiles.filter((profile) => profileCampusMap[profile.id]?.ids?.includes(selectedCampusId));
  }, [profileCampusMap, profiles, selectedCampusId]);

  const openCreateDialog = () => {
    setEditingGroup(null);
    setDialogOpen(true);
  };

  const openEditDialog = (group: LifeGroup) => {
    setEditingGroup(group);
    setDialogOpen(true);
  };

  const handleCampusChange = (value: string) => {
    setSelectedCampusId(value);
    localStorage.setItem("life-groups-campus-filter", value);
  };

  const handleDelete = async (group: LifeGroup) => {
    if (!window.confirm(`Delete ${group.name}?`)) return;
    await deleteLifeGroup.mutateAsync(group.id);
  };

  if (!isStudentApp) {
    return (
      <div className="container max-w-3xl py-8">
        <Alert>
          <UsersRound className="h-4 w-4" />
          <AlertDescription>Life Groups are available in the HS and MS student resources.</AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="container max-w-7xl space-y-6 py-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <Button variant="ghost" asChild className="-ml-3 mb-2 gap-2">
            <Link to="/dashboard">
              <ArrowLeft className="h-4 w-4" />
              Dashboard
            </Link>
          </Button>
          <h1 className="font-display text-3xl font-bold text-foreground md:text-4xl">Life Groups</h1>
          <p className="mt-2 text-muted-foreground">Create groups, assign leaders and students, and capture weekly care notes.</p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          {availableCampuses.length > 1 || isAdmin ? (
            <Select value={selectedCampusId} onValueChange={handleCampusChange}>
              <SelectTrigger className="w-full sm:w-[220px]">
                <MapPin className="mr-2 h-4 w-4 text-muted-foreground" />
                <SelectValue placeholder="Campus" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Campuses</SelectItem>
                {availableCampuses.map((campus) => (
                  <SelectItem key={campus?.id} value={campus?.id || ""}>
                    {campus?.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : null}
          {canManageGroups && (
            <>
              <Button variant="outline" onClick={() => setImportDialogOpen(true)} className="gap-2">
                <Upload className="h-4 w-4" />
                Import
              </Button>
              <Button onClick={openCreateDialog} className="gap-2">
                <Plus className="h-4 w-4" />
                New Group
              </Button>
            </>
          )}
        </div>
      </div>

      {isLoading ? (
        <div className="flex min-h-[320px] items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : groups.length === 0 ? (
        <Card>
          <CardContent className="flex min-h-[260px] flex-col items-center justify-center gap-4 text-center">
            <UsersRound className="h-10 w-10 text-muted-foreground" />
            <div>
              <h2 className="text-lg font-semibold">No Life Groups yet</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {canManageGroups ? "Create the first group for this campus." : "You are not assigned to a Life Group yet."}
              </p>
            </div>
            {canManageGroups && (
              <Button onClick={openCreateDialog} className="gap-2">
                <Plus className="h-4 w-4" />
                New Group
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[380px_1fr]">
          <div className="space-y-3">
            {groups.map((group) => {
              const latestReport = group.reports[0];
              const isSelected = group.id === selectedGroupId;
              return (
                <button
                  key={group.id}
                  type="button"
                  onClick={() => setSelectedGroupId(group.id)}
                  className={cn(
                    "w-full rounded-lg border bg-card p-4 text-left transition-colors hover:bg-muted/40",
                    isSelected && "border-primary/60 bg-primary/5",
                  )}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate font-semibold">{group.name}</p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        <Badge variant="secondary">{genderLabel(group.gender)}</Badge>
                        <Badge variant="outline">{group.grade_level}th</Badge>
                      </div>
                    </div>
                    {group.isCurrentUserLeader && <UserCheck className="h-5 w-5 text-primary" />}
                  </div>
                  <div className="mt-3 space-y-1 text-sm text-muted-foreground">
                    <p className="flex items-center gap-2">
                      <MapPin className="h-4 w-4" />
                      {group.meeting_location}
                    </p>
                    <p>{group.leaders.length} leaders • {group.students.length} students</p>
                    {latestReport && <p>Last check-in {formatDate(latestReport.meeting_date)}</p>}
                  </div>
                </button>
              );
            })}
          </div>

          {selectedGroup && (
            <div className="space-y-6">
              <Card>
                <CardHeader className="space-y-4">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <CardTitle className="text-2xl">{selectedGroup.name}</CardTitle>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <Badge>{genderLabel(selectedGroup.gender)}</Badge>
                        <Badge variant="secondary">{selectedGroup.grade_level}th Grade</Badge>
                        <Badge variant="outline">{selectedCampus?.name || "All Campuses"}</Badge>
                      </div>
                    </div>
                    {canManageGroups && (
                      <div className="flex gap-2">
                        <Button variant="outline" size="icon" onClick={() => openEditDialog(selectedGroup)}>
                          <Edit className="h-4 w-4" />
                          <span className="sr-only">Edit</span>
                        </Button>
                        <Button variant="outline" size="icon" onClick={() => handleDelete(selectedGroup)}>
                          <Trash2 className="h-4 w-4" />
                          <span className="sr-only">Delete</span>
                        </Button>
                      </div>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="space-y-5">
                  <div className="grid gap-4 md:grid-cols-2">
                    <div>
                      <p className="mb-2 text-sm font-medium">Leaders</p>
                      <div className="flex flex-wrap gap-2">
                        {selectedGroup.leaders.map((leader) => <PersonPill key={leader.id} person={leader} />)}
                        {selectedGroup.leaders.length === 0 && <p className="text-sm text-muted-foreground">No leaders assigned.</p>}
                      </div>
                    </div>
                    <div>
                      <p className="mb-2 text-sm font-medium">Students</p>
                      <div className="flex flex-wrap gap-2">
                        {selectedGroup.students.slice(0, 12).map((student) => <PersonPill key={student.id} person={student} />)}
                        {selectedGroup.students.length > 12 && <Badge variant="outline">+{selectedGroup.students.length - 12}</Badge>}
                        {selectedGroup.students.length === 0 && <p className="text-sm text-muted-foreground">No students assigned.</p>}
                      </div>
                    </div>
                  </div>
                  <Separator />
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <MapPin className="h-4 w-4" />
                    Meets at {selectedGroup.meeting_location}
                  </div>
                </CardContent>
              </Card>

              <WeeklyCheckIn group={selectedGroup} isAdmin={isAdmin} canSubmit={canSubmitSelectedGroup} />
              <ReportHistory group={selectedGroup} isAdmin={isAdmin} />
            </div>
          )}
        </div>
      )}

      <LifeGroupDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        group={editingGroup}
        campusId={selectedCampusId === "all" ? null : selectedCampusId}
        profiles={campusFilteredProfiles}
        meetingLocations={meetingLocations}
      />
      <LifeGroupImportDialog
        open={importDialogOpen}
        onOpenChange={setImportDialogOpen}
        campusId={selectedCampusId === "all" ? null : selectedCampusId}
        profiles={campusFilteredProfiles}
        existingGroups={groups}
        meetingLocations={meetingLocations}
      />
    </div>
  );
}
