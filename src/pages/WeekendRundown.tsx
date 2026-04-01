import { useCallback, useEffect, useMemo, useState } from "react";
import { Navigate } from "react-router-dom";
import { format } from "date-fns";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { BookOpenText, ClipboardList, MessageSquare, Music2, Sparkles } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useUserRoles } from "@/hooks/useUserRoles";
import { useCampuses, useUserCampuses } from "@/hooks/useCampuses";
import {
  useSaveWeekendRundown,
  useWeekendRundown,
  useWeekendRundownEntries,
  useWeekendRundownSetSongs,
} from "@/hooks/useWeekendRundown";
import {
  canAccessWeekendRundown,
  canReviewWeekendSongs,
  getWeekendRundownTargetSunday,
  WEEKEND_RUNDOWN_STATUS_OPTIONS,
} from "@/lib/weekendRundown";
import { useCampusSelectionOptional } from "@/components/layout/CampusSelectionContext";

type SongNotesState = Record<string, string>;
type VocalNotesState = Record<string, string>;
type VocalFitState = Record<string, string | null>;

function getInitials(name: string | null) {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

export default function WeekendRundown() {
  const { user } = useAuth();
  const { data: roles = [], isLoading: rolesLoading } = useUserRoles(user?.id);
  const { data: campuses = [] } = useCampuses();
  const { data: userCampuses = [] } = useUserCampuses(user?.id);
  const campusContext = useCampusSelectionOptional();

  const roleNames = roles.map((role) => role.role);
  const hasAccess = canAccessWeekendRundown(roleNames);
  const canReviewSongs = canReviewWeekendSongs(roleNames);

  const initialWeekendDate = useMemo(() => getWeekendRundownTargetSunday(), []);
  const [selectedWeekendDate] = useState<Date>(initialWeekendDate);
  const weekendDateStr = format(selectedWeekendDate, "yyyy-MM-dd");

  const accessibleCampusIds = useMemo(() => {
    if (roleNames.some((role) => role === "admin" || role === "network_worship_pastor" || role === "network_worship_leader")) {
      return campuses.map((campus) => campus.id);
    }

    return Array.from(
      new Set([
        ...userCampuses.map((entry) => entry.campus_id),
        ...roles.map((entry) => entry.admin_campus_id).filter(Boolean) as string[],
      ]),
    );
  }, [campuses, roleNames, roles, userCampuses]);

  const availableCampuses = useMemo(() => {
    if (accessibleCampusIds.length === 0) return [];
    return campuses.filter((campus) => accessibleCampusIds.includes(campus.id));
  }, [accessibleCampusIds, campuses]);

  const [localCampusId, setLocalCampusId] = useState("");
  const selectedCampusId = campusContext?.selectedCampusId || localCampusId;
  const setSelectedCampusId = useCallback((value: string) => {
    if (campusContext) {
      campusContext.setSelectedCampusId(value);
      return;
    }
    setLocalCampusId(value);
  }, [campusContext]);

  useEffect(() => {
    if ((!selectedCampusId || !availableCampuses.some((campus) => campus.id === selectedCampusId)) && availableCampuses.length > 0) {
      setSelectedCampusId(availableCampuses[0].id);
    }
  }, [availableCampuses, selectedCampusId, setSelectedCampusId]);

  const selectedCampus = useMemo(
    () => availableCampuses.find((campus) => campus.id === selectedCampusId) || null,
    [availableCampuses, selectedCampusId],
  );

  const { data: existingRundown } = useWeekendRundown(user?.id, selectedCampus?.id || null, weekendDateStr);
  const { data: entries = [] } = useWeekendRundownEntries(selectedCampus?.id || null, weekendDateStr);
  const { data: setSongs = [], isLoading: setSongsLoading } = useWeekendRundownSetSongs(
    selectedCampus,
    selectedWeekendDate,
    canReviewSongs,
  );
  const saveWeekendRundown = useSaveWeekendRundown(user?.id);

  const [overallStatus, setOverallStatus] = useState<(typeof WEEKEND_RUNDOWN_STATUS_OPTIONS)[number]["value"]>("no_issues");
  const [notes, setNotes] = useState("");
  const [songNotes, setSongNotes] = useState<SongNotesState>({});
  const [vocalNotes, setVocalNotes] = useState<VocalNotesState>({});
  const [vocalFitLabels, setVocalFitLabels] = useState<VocalFitState>({});

  useEffect(() => {
    if (!existingRundown) {
      setOverallStatus("no_issues");
      setNotes("");
      setSongNotes({});
      setVocalNotes({});
      setVocalFitLabels({});
      return;
    }

    setOverallStatus(existingRundown.rundown.overall_status);
    setNotes(existingRundown.rundown.notes || "");

    const nextSongNotes: SongNotesState = {};
    for (const item of existingRundown.songFeedback) {
      nextSongNotes[item.song_id] = item.notes || "";
    }
    setSongNotes(nextSongNotes);

    const nextVocalNotes: VocalNotesState = {};
    const nextVocalFitLabels: VocalFitState = {};
    for (const item of existingRundown.vocalFeedback) {
      const key = `${item.song_id}:${item.vocalist_id}`;
      nextVocalNotes[key] = item.notes || "";
      nextVocalFitLabels[key] = item.fit_label;
    }
    setVocalNotes(nextVocalNotes);
    setVocalFitLabels(nextVocalFitLabels);
  }, [existingRundown]);

  if (!rolesLoading && !hasAccess) {
    return <Navigate to="/dashboard" replace />;
  }

  const otherEntries = entries.filter((entry) => entry.user_id !== user?.id);

  const handleSave = async () => {
    if (!selectedCampus) return;

    const vocalFeedbackKeys = Array.from(
      new Set([...Object.keys(vocalNotes), ...Object.keys(vocalFitLabels)]),
    );

    await saveWeekendRundown.mutateAsync({
      campusId: selectedCampus.id,
      weekendDate: weekendDateStr,
      overallStatus,
      notes,
      songFeedback: Object.entries(songNotes).map(([songId, songNote]) => ({
        song_id: songId,
        notes: songNote,
      })),
      vocalFeedback: vocalFeedbackKeys.map((key) => {
        const [songId, vocalistId] = key.split(":");
        return {
          song_id: songId,
          vocalist_id: vocalistId,
          fit_label: vocalFitLabels[key] || null,
          notes: vocalNotes[key] || "",
        };
      }),
    });
  };

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <ClipboardList className="h-5 w-5 text-primary" />
          <h1 className="font-display text-3xl font-semibold tracking-tight">Weekend Rundown</h1>
        </div>
        <p className="text-muted-foreground">
          Sunday’s 1:45 PM recap space for worship, video, and production leadership.
        </p>
      </div>

      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="flex flex-wrap items-center gap-2">
            <span>{selectedCampus?.name || "Select a campus"}</span>
            <Badge variant="outline">{format(selectedWeekendDate, "EEEE, MMM d")}</Badge>
          </CardTitle>
          <CardDescription>
            Capture how the weekend went, then use worship notes later when you’re building another set.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {availableCampuses.length > 1 && (
            <div className="space-y-2">
              <Label htmlFor="weekend-rundown-campus">Campus</Label>
              <Select value={selectedCampusId} onValueChange={setSelectedCampusId}>
                <SelectTrigger id="weekend-rundown-campus" className="w-full sm:max-w-xs">
                  <SelectValue placeholder="Select a campus" />
                </SelectTrigger>
                <SelectContent>
                  {availableCampuses.map((campus) => (
                    <SelectItem key={campus.id} value={campus.id}>
                      {campus.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="grid gap-4 lg:grid-cols-[280px_minmax(0,1fr)]">
            <div className="space-y-2">
              <Label htmlFor="weekend-status">Weekend status</Label>
              <Select value={overallStatus} onValueChange={(value) => setOverallStatus(value as typeof overallStatus)}>
                <SelectTrigger id="weekend-status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {WEEKEND_RUNDOWN_STATUS_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="weekend-notes">Weekend notes</Label>
              <Textarea
                id="weekend-notes"
                placeholder="Leave notes for the team about wins, misses, friction points, or anything to remember next time."
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                className="min-h-[140px]"
              />
            </div>
          </div>

          {canReviewSongs && (
            <>
              <Separator />
              <div className="space-y-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <Music2 className="h-4 w-4 text-primary" />
                    <h2 className="font-semibold">Worship Review</h2>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Mark songs that were a strong fit for the vocalists you scheduled and leave notes for next time.
                  </p>
                </div>

                {setSongsLoading ? (
                  <p className="text-sm text-muted-foreground">Loading the weekend set...</p>
                ) : setSongs.length === 0 ? (
                  <Card className="border-dashed">
                    <CardContent className="py-6 text-sm text-muted-foreground">
                      No weekend set was found for this campus yet.
                    </CardContent>
                  </Card>
                ) : (
                  <div className="space-y-4">
                    {setSongs.map((song, index) => (
                      <Card key={song.song_id} className="border-border/60">
                        <CardHeader className="pb-3">
                          <CardTitle className="flex items-center gap-2 text-base">
                            <Badge variant="outline">{index + 1}</Badge>
                            <span>{song.title}</span>
                          </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                          <div className="space-y-2">
                            <Label htmlFor={`song-note-${song.song_id}`} className="flex items-center gap-2 text-sm">
                              <BookOpenText className="h-4 w-4 text-muted-foreground" />
                              Song set notes
                            </Label>
                            <Textarea
                              id={`song-note-${song.song_id}`}
                              placeholder="Song-specific notes, transitions, moments to remember, or arrangement feedback."
                              value={songNotes[song.song_id] || ""}
                              onChange={(event) =>
                                setSongNotes((current) => ({ ...current, [song.song_id]: event.target.value }))
                              }
                              className="min-h-[90px]"
                            />
                          </div>

                          {song.vocalists.length > 0 ? (
                            <div className="space-y-3">
                              {song.vocalists.map((vocalist) => {
                                const feedbackKey = `${song.song_id}:${vocalist.id}`;
                                return (
                                  <div key={feedbackKey} className="rounded-lg border border-border/60 bg-muted/20 p-4">
                                    <div className="mb-3 flex items-center justify-between gap-3">
                                      <div>
                                        <p className="font-medium">{vocalist.name}</p>
                                        <p className="text-xs text-muted-foreground">Vocal review</p>
                                      </div>
                                      <Select
                                        value={vocalFitLabels[feedbackKey] || "none"}
                                        onValueChange={(value) =>
                                          setVocalFitLabels((current) => ({
                                            ...current,
                                            [feedbackKey]: value === "none" ? null : value,
                                          }))
                                        }
                                      >
                                        <SelectTrigger className="w-[160px]">
                                          <SelectValue placeholder="No label" />
                                        </SelectTrigger>
                                        <SelectContent>
                                          <SelectItem value="none">No label</SelectItem>
                                          <SelectItem value="good_fit">Good Fit</SelectItem>
                                        </SelectContent>
                                      </Select>
                                    </div>
                                    <Textarea
                                      placeholder="How did they carry this song? Anything to remember about key, leadership, confidence, or fit?"
                                      value={vocalNotes[feedbackKey] || ""}
                                      onChange={(event) =>
                                        setVocalNotes((current) => ({
                                          ...current,
                                          [feedbackKey]: event.target.value,
                                        }))
                                      }
                                      className="min-h-[90px]"
                                    />
                                  </div>
                                );
                              })}
                            </div>
                          ) : (
                            <p className="text-sm text-muted-foreground">
                              No vocalist assignments were attached to this song on the saved set.
                            </p>
                          )}
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}

          <div className="flex justify-end">
            <Button onClick={handleSave} disabled={!selectedCampus || saveWeekendRundown.isPending} className="gap-2">
              <Sparkles className="h-4 w-4" />
              {saveWeekendRundown.isPending ? "Saving..." : "Save Weekend Rundown"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <MessageSquare className="h-4 w-4 text-primary" />
            Team Notes
          </CardTitle>
          <CardDescription>
            Shared rundown entries from other eligible leaders for this campus and weekend.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {otherEntries.length === 0 ? (
            <p className="text-sm text-muted-foreground">No other rundown entries have been added for this weekend yet.</p>
          ) : (
            <div className="space-y-3">
              {otherEntries.map((entry) => (
                <div key={entry.id} className="rounded-lg border border-border/60 p-4">
                  <div className="mb-3 flex items-center gap-3">
                    <Avatar className="h-9 w-9">
                      <AvatarImage src={entry.profile_avatar_url || undefined} />
                      <AvatarFallback>{getInitials(entry.profile_name)}</AvatarFallback>
                    </Avatar>
                    <div className="min-w-0">
                      <p className="font-medium">{entry.profile_name || "Unknown leader"}</p>
                      <p className="text-xs text-muted-foreground">
                        Updated {format(new Date(entry.updated_at), "MMM d, h:mm a")}
                      </p>
                    </div>
                    <Badge variant="outline" className="ml-auto">
                      {WEEKEND_RUNDOWN_STATUS_OPTIONS.find((option) => option.value === entry.overall_status)?.label || entry.overall_status}
                    </Badge>
                  </div>
                  <p className="text-sm whitespace-pre-wrap text-muted-foreground">
                    {entry.notes || "No extra notes were added."}
                  </p>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
