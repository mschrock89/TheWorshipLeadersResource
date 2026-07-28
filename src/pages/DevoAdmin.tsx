import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft, BookOpen, FileText, Loader2, Plus, Search, ShieldCheck, Trash2, Upload } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { DatePickerField } from "@/components/devo/DatePickerField";
import { useCapabilities } from "@/hooks/useCapabilities";
import { useCampuses } from "@/hooks/useCampuses";
import {
  combineLocalDateAndTime,
  formatDevoPostDay,
  formatDevoPostTime,
  getDevoGuideSignedUrl,
  splitLocalDateAndTime,
  useAdminDevoAssignments,
  useCancelDevoAssignment,
  useCreateDevoAssignment,
  useDevoSeriesList,
  useSaveDevoSeries,
  useUploadDevoSeriesGuide,
  type DevoAssignmentStatus,
  type DevoRosterEntry,
} from "@/hooks/useDevoAssignments";
import { useBasicProfiles } from "@/hooks/usePermissionsAdmin";
import { CAPABILITIES } from "@/lib/capabilities";
import {
  getDefaultFeedMinistryType,
  getFeedMinistryTypesForResourceApp,
} from "@/lib/feedMinistries";
import { getCurrentResourceAppKey } from "@/lib/resourceApp";
import { toast } from "sonner";

type DraftRosterRow = DevoRosterEntry & { key: string };

function statusLabel(status: DevoAssignmentStatus | string) {
  switch (status) {
    case "assigned":
      return "Assigned";
    case "guide_uploaded":
      return "Guide uploaded";
    case "scheduled":
      return "Scheduled";
    case "posted":
      return "Live";
    case "cancelled":
      return "Cancelled";
    default:
      return status;
  }
}

function toLocalDateInputValue(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function startOfLocalDayIso(dateStr: string) {
  return combineLocalDateAndTime(dateStr, "00:00");
}

function parseLocalDateParts(dateStr: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr);
  if (!match) return null;
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

function endDateFromWeeks(startDateStr: string, weeks: number): string {
  const start = parseLocalDateParts(startDateStr);
  if (!start || weeks < 1) return startDateStr;
  const end = new Date(start);
  end.setDate(end.getDate() + weeks * 7);
  return toLocalDateInputValue(end);
}

function endOfLocalDayIso(dateStr: string) {
  return combineLocalDateAndTime(dateStr, "23:59");
}

export default function DevoAdmin() {
  const navigate = useNavigate();
  const { can, isLoading: capsLoading } = useCapabilities();
  const canManage = can(CAPABILITIES.ADMIN_TOOLS);
  const resourceApp = getCurrentResourceAppKey();
  const ministries = getFeedMinistryTypesForResourceApp(resourceApp);
  const { data: campuses = [] } = useCampuses();
  const { data: profiles = [], isLoading: profilesLoading } = useBasicProfiles();
  const { data: seriesList = [], isLoading: seriesLoading } = useDevoSeriesList();
  const [selectedSeriesId, setSelectedSeriesId] = useState<string>("");
  const {
    data: assignments = [],
    isLoading: assignmentsLoading,
    isFetching: assignmentsFetching,
    isSuccess: assignmentsReady,
  } = useAdminDevoAssignments(selectedSeriesId || null);
  const saveSeries = useSaveDevoSeries();
  const uploadSeriesGuide = useUploadDevoSeriesGuide();
  const createAssignment = useCreateDevoAssignment();
  const cancelAssignment = useCancelDevoAssignment();
  const guideInputRef = useRef<HTMLInputElement>(null);
  const [openingGuide, setOpeningGuide] = useState(false);

  const [editingSeriesId, setEditingSeriesId] = useState<string | null>(null);
  const [pendingRosterHydrate, setPendingRosterHydrate] = useState(false);
  const [title, setTitle] = useState("");
  const [startsDate, setStartsDate] = useState(() => toLocalDateInputValue());
  const [weeksToRun, setWeeksToRun] = useState("4");
  const [permissionDays, setPermissionDays] = useState("7");
  const [campusId, setCampusId] = useState("");
  const [ministryType, setMinistryType] = useState(getDefaultFeedMinistryType(resourceApp));

  const [assigneeSearch, setAssigneeSearch] = useState("");
  const [draftAssigneeId, setDraftAssigneeId] = useState("");
  const [draftChapter, setDraftChapter] = useState("");
  const [draftPostDate, setDraftPostDate] = useState(toLocalDateInputValue());
  const [draftPostTime, setDraftPostTime] = useState("09:00");
  const [roster, setRoster] = useState<DraftRosterRow[]>([]);

  // Add-to-existing-series form
  const [addAssigneeId, setAddAssigneeId] = useState("");
  const [addChapter, setAddChapter] = useState("");
  const [addPostDate, setAddPostDate] = useState(toLocalDateInputValue());
  const [addPostTime, setAddPostTime] = useState("09:00");

  const filteredProfiles = useMemo(() => {
    const q = assigneeSearch.trim().toLowerCase();
    const list = profiles.filter((p) => p.full_name);
    if (!q) return list.slice(0, 50);
    return list.filter((p) => (p.full_name || "").toLowerCase().includes(q)).slice(0, 50);
  }, [assigneeSearch, profiles]);

  const profileName = (id: string) =>
    profiles.find((p) => p.id === id)?.full_name || "Unknown";

  const editingSeries = seriesList.find((s) => s.id === editingSeriesId) || null;
  const selectedSeries = seriesList.find((s) => s.id === selectedSeriesId) || null;

  const resetEditor = () => {
    setEditingSeriesId(null);
    setTitle("");
    setStartsDate(toLocalDateInputValue());
    setWeeksToRun("4");
    setPermissionDays("7");
    setCampusId("");
    setMinistryType(getDefaultFeedMinistryType(resourceApp));
    setRoster([]);
    setDraftAssigneeId("");
    setDraftChapter("");
  };

  const loadSeriesIntoEditor = (seriesId: string) => {
    const series = seriesList.find((s) => s.id === seriesId);
    if (!series) return;
    setEditingSeriesId(series.id);
    setTitle(series.title);
    const startParts = splitLocalDateAndTime(series.starts_at);
    setStartsDate(startParts.date);
    setWeeksToRun(String(series.weeks_to_run || 4));
    setPermissionDays(String(series.default_permission_days || 7));
    setCampusId(series.campus_id || "");
    setMinistryType(series.ministry_type || getDefaultFeedMinistryType(resourceApp));
    setSelectedSeriesId(series.id);
    setPendingRosterHydrate(true);
  };

  useEffect(() => {
    if (!pendingRosterHydrate || !editingSeriesId) return;
    if (selectedSeriesId !== editingSeriesId) return;
    if (assignmentsLoading || assignmentsFetching || !assignmentsReady) return;
    // Guard against hydrating a stale "all series" payload into the editor.
    if (assignments.some((a) => a.series_id && a.series_id !== editingSeriesId)) return;
    setRoster(
      assignments
        .filter((a) => a.status !== "cancelled")
        .map((a) => {
          const { date, time } = splitLocalDateAndTime(a.scheduled_post_at);
          return {
            key: a.id,
            assignee_id: a.assignee_id,
            chapter_reference: a.chapter_reference,
            post_date: a.due_date || date,
            post_time: time,
            permission_duration_days: a.permission_duration_days,
            notes: a.notes,
          };
        }),
    );
    setPendingRosterHydrate(false);
  }, [
    pendingRosterHydrate,
    editingSeriesId,
    selectedSeriesId,
    assignments,
    assignmentsLoading,
    assignmentsFetching,
    assignmentsReady,
  ]);

  if (capsLoading) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-10">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="mt-6 h-64 w-full" />
      </div>
    );
  }

  if (!canManage) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16 text-center">
        <ShieldCheck className="mx-auto h-10 w-10 text-muted-foreground" />
        <h1 className="mt-4 text-xl font-semibold">DEVO Admin</h1>
        <p className="mt-2 text-muted-foreground">You don&apos;t have access to manage devotionals.</p>
      </div>
    );
  }

  const addRosterRow = () => {
    if (!draftAssigneeId) {
      toast.error("Pick a team member");
      return;
    }
    if (!draftChapter.trim()) {
      toast.error("Enter a chapter");
      return;
    }
    if (roster.some((r) => r.assignee_id === draftAssigneeId && r.chapter_reference === draftChapter.trim())) {
      toast.error("That person/chapter is already on the roster");
      return;
    }
    setRoster((current) => [
      ...current,
      {
        key: `${draftAssigneeId}-${Date.now()}`,
        assignee_id: draftAssigneeId,
        chapter_reference: draftChapter.trim(),
        post_date: draftPostDate,
        post_time: draftPostTime,
      },
    ]);
    setDraftChapter("");
  };

  const weeks = Number(weeksToRun);
  const computedEndsDate =
    Number.isFinite(weeks) && weeks >= 1 ? endDateFromWeeks(startsDate, weeks) : startsDate;

  const savePayload = (mode: "draft" | "publish") => {
    const days = Number(permissionDays);
    if (!Number.isFinite(days) || days < 1) {
      toast.error("Permission duration must be at least 1 day");
      return null;
    }
    if (!Number.isFinite(weeks) || weeks < 1) {
      toast.error("Series must run at least 1 week");
      return null;
    }
    if (mode === "publish" && !campusId) {
      toast.error("Pick a campus so posts can go live on The Feed");
      return null;
    }
    if (mode === "publish" && roster.length === 0) {
      toast.error("Add at least one person before publishing");
      return null;
    }
    return {
      seriesId: editingSeriesId,
      title,
      starts_at: startOfLocalDayIso(startsDate),
      ends_at: endOfLocalDayIso(endDateFromWeeks(startsDate, weeks)),
      weeks_to_run: weeks,
      default_permission_days: days,
      campus_id: campusId || null,
      ministry_type: ministryType || null,
      roster: roster.map(({ assignee_id, chapter_reference, post_date, post_time }) => ({
        assignee_id,
        chapter_reference,
        post_date,
        post_time,
      })),
      mode,
    };
  };

  const onSaveDraft = async () => {
    const payload = savePayload("draft");
    if (!payload) return;
    const result = await saveSeries.mutateAsync(payload);
    // Keep roster + form; remember series id so later saves update the same draft.
    setEditingSeriesId(result.series.id);
    setSelectedSeriesId(result.series.id);
  };

  const onPublish = async (event: React.FormEvent) => {
    event.preventDefault();
    const payload = savePayload("publish");
    if (!payload) return;
    const result = await saveSeries.mutateAsync(payload);
    setEditingSeriesId(result.series.id);
    setSelectedSeriesId(result.series.id);
  };

  const onAddToSeries = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selectedSeriesId) {
      toast.error("Select a series first");
      return;
    }
    const series = seriesList.find((s) => s.id === selectedSeriesId);
    if (!series) return;
    if (!addAssigneeId || !addChapter.trim()) {
      toast.error("Person and chapter are required");
      return;
    }
    const personId = addAssigneeId;
    const chapter = addChapter.trim();
    const postDate = addPostDate;
    const postTime = addPostTime;
    const isPublished = series.status === "published";
    await createAssignment.mutateAsync({
      assignee_id: personId,
      chapter_reference: chapter,
      series_id: series.id,
      series_title: series.title,
      scheduled_post_at: combineLocalDateAndTime(postDate, postTime),
      permission_duration_days: series.default_permission_days,
      campus_id: series.campus_id,
      ministry_type: series.ministry_type,
      send_assign_push: isPublished,
      grant_permission: isPublished,
    });
    setAddChapter("");
    setAddAssigneeId("");
    if (editingSeriesId === series.id) {
      setRoster((current) => {
        if (current.some((r) => r.assignee_id === personId && r.chapter_reference === chapter)) {
          return current;
        }
        return [
          ...current,
          {
            key: `${personId}-${Date.now()}`,
            assignee_id: personId,
            chapter_reference: chapter,
            post_date: postDate,
            post_time: postTime,
          },
        ];
      });
    }
  };

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-6 sm:py-8">
      <Button
        variant="ghost"
        size="sm"
        onClick={() => navigate("/admin-tools")}
        className="mb-4 -ml-2 gap-2 text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Admin Tools
      </Button>

      <div className="mb-8 flex items-center gap-3">
        <div className="rounded-full bg-primary/10 p-2">
          <BookOpen className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h1 className="font-display text-3xl font-bold text-foreground">DEVO Admin</h1>
          <p className="mt-1 text-muted-foreground">
            Plan a series, assign chapters and post times, and send Feed how-to pushes
          </p>
        </div>
      </div>

      <Card className="mb-8">
        <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
          <div>
            <CardTitle>{editingSeriesId ? "Edit series" : "New series"}</CardTitle>
            <CardDescription>
              Save a draft anytime — your roster stays put. Publish when you&apos;re ready to notify
              the team and open Feed access windows.
            </CardDescription>
          </div>
          {editingSeriesId ? (
            <div className="flex flex-col items-end gap-2">
              <Badge variant={editingSeries?.status === "draft" ? "secondary" : "outline"}>
                {editingSeries?.status === "draft" ? "Draft" : "Published"}
              </Badge>
              <Button type="button" size="sm" variant="ghost" onClick={resetEditor}>
                New series
              </Button>
            </div>
          ) : null}
        </CardHeader>
        <CardContent>
          <form className="space-y-5" onSubmit={onPublish}>
            <div className="space-y-2">
              <Label htmlFor="series-title">Series title</Label>
              <Input
                id="series-title"
                placeholder="e.g. Summer Devo Series"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-2">
                <Label>Series starts</Label>
                <DatePickerField value={startsDate} onChange={setStartsDate} placeholder="Start date" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="weeks-to-run">Weeks to run</Label>
                <Input
                  id="weeks-to-run"
                  type="number"
                  min={1}
                  max={52}
                  value={weeksToRun}
                  onChange={(e) => setWeeksToRun(e.target.value)}
                  required
                />
                <p className="text-xs text-muted-foreground">
                  Ends {formatDevoPostDay(endOfLocalDayIso(computedEndsDate))}
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="permission-days">Access opens (days before)</Label>
                <Input
                  id="permission-days"
                  type="number"
                  min={1}
                  max={90}
                  value={permissionDays}
                  onChange={(e) => setPermissionDays(e.target.value)}
                  required
                />
                <p className="text-xs text-muted-foreground">
                  Feed posting unlocks this many days before their go-live day
                </p>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Campus</Label>
                <Select
                  value={campusId || "__none__"}
                  onValueChange={(v) => setCampusId(v === "__none__" ? "" : v)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Required to publish" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">None</SelectItem>
                    {campuses.map((campus) => (
                      <SelectItem key={campus.id} value={campus.id}>
                        {campus.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Feed ministry</Label>
                <Select value={ministryType} onValueChange={setMinistryType}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ministries.map((ministry) => (
                      <SelectItem key={ministry.value} value={ministry.value}>
                        {ministry.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-3 rounded-lg border border-border p-4">
              <div>
                <p className="font-medium">Roster</p>
                <p className="text-sm text-muted-foreground">
                  Everyone involved, their chapter, and when their post goes live on The Feed. Saving
                  a draft keeps this list.
                </p>
              </div>

              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  className="pl-9"
                  placeholder="Search team to filter the picker…"
                  value={assigneeSearch}
                  onChange={(e) => setAssigneeSearch(e.target.value)}
                />
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-2 sm:col-span-2">
                  <Label>Person</Label>
                  <Select
                    value={draftAssigneeId || undefined}
                    onValueChange={setDraftAssigneeId}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={profilesLoading ? "Loading…" : "Select person"} />
                    </SelectTrigger>
                    <SelectContent>
                      {filteredProfiles.map((profile) => (
                        <SelectItem key={profile.id} value={profile.id}>
                          {profile.full_name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Chapter</Label>
                  <Input
                    placeholder="e.g. John 3"
                    value={draftChapter}
                    onChange={(e) => setDraftChapter(e.target.value)}
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label>Go-live day</Label>
                    <DatePickerField
                      value={draftPostDate}
                      onChange={setDraftPostDate}
                      placeholder="Pick day"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Go-live time</Label>
                    <Input
                      type="time"
                      value={draftPostTime}
                      onChange={(e) => setDraftPostTime(e.target.value)}
                    />
                  </div>
                </div>
              </div>

              <Button type="button" variant="outline" className="gap-2" onClick={addRosterRow}>
                <Plus className="h-4 w-4" />
                Add to roster
              </Button>

              {roster.length === 0 ? (
                <p className="text-sm text-muted-foreground">No one on the roster yet.</p>
              ) : (
                <ul className="divide-y divide-border rounded-md border border-border">
                  {roster.map((row) => (
                    <li
                      key={row.key}
                      className="flex items-center justify-between gap-3 px-3 py-2 text-sm"
                    >
                      <div className="min-w-0">
                        <p className="font-medium truncate">{profileName(row.assignee_id)}</p>
                        <p className="text-muted-foreground">
                          {row.chapter_reference} · {row.post_date} {row.post_time}
                        </p>
                      </div>
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        onClick={() => setRoster((current) => current.filter((r) => r.key !== row.key))}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="space-y-3 rounded-lg border border-border p-4">
              <div>
                <p className="font-medium">How-to guide</p>
                <p className="text-sm text-muted-foreground">
                  Upload the instructions everyone on the roster should follow. They&apos;ll open it
                  from DEVO after you publish.
                </p>
              </div>
              {!editingSeriesId ? (
                <p className="text-sm text-muted-foreground">
                  Save a draft first, then attach the guide here.
                </p>
              ) : editingSeries?.guide_file_name && editingSeries.guide_storage_path ? (
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="gap-2"
                    disabled={openingGuide}
                    onClick={async () => {
                      if (!editingSeries.guide_storage_path) return;
                      setOpeningGuide(true);
                      try {
                        const url = await getDevoGuideSignedUrl(editingSeries.guide_storage_path);
                        if (url) window.open(url, "_blank", "noopener,noreferrer");
                      } catch (error) {
                        toast.error(error instanceof Error ? error.message : "Couldn't open guide");
                      } finally {
                        setOpeningGuide(false);
                      }
                    }}
                  >
                    {openingGuide ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <FileText className="h-4 w-4" />
                    )}
                    {editingSeries.guide_file_name}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={uploadSeriesGuide.isPending}
                    onClick={() => guideInputRef.current?.click()}
                  >
                    Replace
                  </Button>
                </div>
              ) : (
                <Button
                  type="button"
                  variant="outline"
                  className="gap-2"
                  disabled={uploadSeriesGuide.isPending}
                  onClick={() => guideInputRef.current?.click()}
                >
                  {uploadSeriesGuide.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Upload className="h-4 w-4" />
                  )}
                  Upload how-to guide
                </Button>
              )}
              <input
                ref={guideInputRef}
                type="file"
                className="hidden"
                accept=".pdf,.doc,.docx,.txt,.md,application/pdf,text/plain"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  event.target.value = "";
                  if (!file || !editingSeries) return;
                  uploadSeriesGuide.mutate({ series: editingSeries, file });
                }}
              />
            </div>

            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                disabled={saveSeries.isPending || !title.trim()}
                className="gap-2"
                onClick={onSaveDraft}
              >
                {saveSeries.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                Save draft
              </Button>
              <Button
                type="submit"
                disabled={saveSeries.isPending || roster.length === 0}
                className="gap-2"
              >
                {saveSeries.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                Publish & notify
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card className="mb-8">
        <CardHeader>
          <CardTitle>Series roster</CardTitle>
          <CardDescription>
            Open a draft to keep editing, or review everyone assigned across series
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Series</Label>
            <Select
              value={selectedSeriesId || "__all__"}
              onValueChange={(v) => {
                const next = v === "__all__" ? "" : v;
                setSelectedSeriesId(next);
                if (next) loadSeriesIntoEditor(next);
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder={seriesLoading ? "Loading…" : "All series"} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">All series</SelectItem>
                {seriesList.map((series) => (
                  <SelectItem key={series.id} value={series.id}>
                    {series.title}
                    {series.status === "draft" ? " (draft)" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {selectedSeriesId && (
            <form
              onSubmit={onAddToSeries}
              className="grid gap-3 rounded-lg border border-border p-4 sm:grid-cols-2"
            >
              <p className="sm:col-span-2 text-sm font-medium">
                Add one person to this series
                {selectedSeries?.status === "draft"
                  ? " (draft — no notification until you publish)"
                  : ""}
              </p>
              <Select value={addAssigneeId || undefined} onValueChange={setAddAssigneeId}>
                <SelectTrigger>
                  <SelectValue placeholder="Person" />
                </SelectTrigger>
                <SelectContent>
                  {filteredProfiles.map((profile) => (
                    <SelectItem key={profile.id} value={profile.id}>
                      {profile.full_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input
                placeholder="Chapter"
                value={addChapter}
                onChange={(e) => setAddChapter(e.target.value)}
              />
              <div className="space-y-2">
                <Label>Go-live day</Label>
                <DatePickerField value={addPostDate} onChange={setAddPostDate} placeholder="Pick day" />
              </div>
              <div className="space-y-2">
                <Label>Go-live time</Label>
                <Input type="time" value={addPostTime} onChange={(e) => setAddPostTime(e.target.value)} />
              </div>
              <Button type="submit" disabled={createAssignment.isPending} className="sm:col-span-2 gap-2">
                {createAssignment.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                {selectedSeries?.status === "draft" ? "Add to draft" : "Assign & notify"}
              </Button>
            </form>
          )}

          {assignmentsLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-14 w-full" />
              <Skeleton className="h-14 w-full" />
            </div>
          ) : assignments.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">No assignments yet.</p>
          ) : (
            <ul className="divide-y divide-border">
              {assignments.map((assignment) => {
                const assigneeName =
                  assignment.assignee?.full_name || assignment.assignee?.email || "Unknown";
                return (
                  <li
                    key={assignment.id}
                    className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="min-w-0 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-medium">{assigneeName}</p>
                        <Badge variant="outline">{statusLabel(assignment.status)}</Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {assignment.chapter_reference}
                        {assignment.series_title ? ` · ${assignment.series_title}` : ""}
                        {assignment.scheduled_post_at
                          ? ` · Goes live ${formatDevoPostDay(assignment.scheduled_post_at)} at ${formatDevoPostTime(assignment.scheduled_post_at)}`
                          : ""}
                        {assignment.permission_duration_days
                          ? ` · access ${assignment.permission_duration_days}d before`
                          : ""}
                      </p>
                      {assignment.series?.guide_file_name ? (
                        <button
                          type="button"
                          className="text-sm text-primary hover:underline"
                          onClick={async () => {
                            if (!assignment.series?.guide_storage_path) return;
                            try {
                              const url = await getDevoGuideSignedUrl(assignment.series.guide_storage_path);
                              if (url) window.open(url, "_blank", "noopener,noreferrer");
                            } catch (error) {
                              toast.error(
                                error instanceof Error ? error.message : "Couldn't open guide",
                              );
                            }
                          }}
                        >
                          {assignment.series.guide_file_name}
                        </button>
                      ) : null}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {assignment.status === "posted" && (
                        <Button asChild size="sm" variant="outline">
                          <Link to="/feed">Feed</Link>
                        </Button>
                      )}
                      {assignment.status !== "cancelled" && assignment.status !== "posted" && (
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          disabled={cancelAssignment.isPending}
                          onClick={() => cancelAssignment.mutate(assignment)}
                        >
                          Cancel
                        </Button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
