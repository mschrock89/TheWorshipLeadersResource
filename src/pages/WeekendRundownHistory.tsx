import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { format, parseISO } from "date-fns";
import { ArrowLeft, BookOpenText, ClipboardList, History, MessageSquare, Music2, Plus, Users } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { useCampusSelectionOptional } from "@/components/layout/CampusSelectionContext";
import { useAuth } from "@/hooks/useAuth";
import { useCampuses, useUserCampuses } from "@/hooks/useCampuses";
import { useUserRoles } from "@/hooks/useUserRoles";
import {
  useWeekendRundownHistory,
  useWeekendRundownHistoryDetail,
} from "@/hooks/useWeekendRundown";
import { canAccessWeekendRundown, GOOD_FIT_LABEL, WEEKEND_RUNDOWN_STATUS_OPTIONS } from "@/lib/weekendRundown";
import { isCurrentStudentResourceApp } from "@/lib/resourceApp";

function getInitials(name: string | null) {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

function statusLabel(status: string) {
  return WEEKEND_RUNDOWN_STATUS_OPTIONS.find((option) => option.value === status)?.label || status;
}

export default function WeekendRundownHistory() {
  const { user } = useAuth();
  const { data: roles = [], isLoading: rolesLoading } = useUserRoles(user?.id);
  const { data: campuses = [] } = useCampuses();
  const { data: userCampuses = [] } = useUserCampuses(user?.id);
  const campusContext = useCampusSelectionOptional();

  const roleNames = roles.map((role) => role.role);
  const isStudentApp = isCurrentStudentResourceApp();
  const rundownName = isStudentApp ? "Wednesday Rundown" : "Weekend Rundown";
  const hasAccess = canAccessWeekendRundown(roleNames);

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

  const { data: history = [], isLoading: historyLoading } = useWeekendRundownHistory(selectedCampus?.id || null);
  const [selectedWeekendDate, setSelectedWeekendDate] = useState<string | null>(null);

  useEffect(() => {
    if (history.length === 0) {
      setSelectedWeekendDate(null);
      return;
    }
    if (!selectedWeekendDate || !history.some((entry) => entry.weekend_date === selectedWeekendDate)) {
      setSelectedWeekendDate(history[0].weekend_date);
    }
  }, [history, selectedWeekendDate]);

  const { data: detailEntries = [], isLoading: detailLoading } = useWeekendRundownHistoryDetail(
    selectedCampus?.id || null,
    selectedWeekendDate,
  );

  if (!rolesLoading && !hasAccess) {
    return <Navigate to="/dashboard" replace />;
  }

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <History className="h-5 w-5 text-primary" />
          <h1 className="font-display text-3xl font-semibold tracking-tight">Past {rundownName}s</h1>
        </div>
        <p className="text-muted-foreground">
          Review saved {isStudentApp ? "Wednesday" : "weekend"} rundowns, worship notes, and vocalist feedback for any prior date.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <Button asChild variant="outline" size="sm" className="gap-2">
            <Link to="/weekend-rundown">
              <ArrowLeft className="h-4 w-4" />
              Back to current {rundownName}
            </Link>
          </Button>
          <Button asChild size="sm" className="gap-2">
            <Link to="/weekend-rundown">
              <Plus className="h-4 w-4" />
              Add missing rundown
            </Link>
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-4">
          <CardTitle>{selectedCampus?.name || "Select a campus"}</CardTitle>
          <CardDescription>
            Pick a past date to read every leader entry saved for that {isStudentApp ? "Wednesday" : "weekend"}.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {availableCampuses.length > 1 && (
            <div className="space-y-2">
              <Label htmlFor="rundown-history-campus">Campus</Label>
              <Select value={selectedCampusId} onValueChange={setSelectedCampusId}>
                <SelectTrigger id="rundown-history-campus" className="w-full sm:max-w-xs">
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

          {historyLoading ? (
            <p className="text-sm text-muted-foreground">Loading past rundowns...</p>
          ) : history.length === 0 ? (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                No saved {rundownName.toLowerCase()}s yet for this campus.
              </p>
              <Button asChild size="sm" className="gap-2">
                <Link to="/weekend-rundown">
                  <Plus className="h-4 w-4" />
                  Add a catch-up rundown
                </Link>
              </Button>
            </div>
          ) : (
            <div className="grid gap-6 lg:grid-cols-[280px_minmax(0,1fr)]">
              <div className="space-y-2">
                <Label>Past dates</Label>
                <div className="space-y-2">
                  {history.map((entry) => {
                    const isSelected = entry.weekend_date === selectedWeekendDate;
                    return (
                      <button
                        key={entry.weekend_date}
                        type="button"
                        onClick={() => setSelectedWeekendDate(entry.weekend_date)}
                        className={`w-full rounded-lg border p-3 text-left transition-colors ${
                          isSelected
                            ? "border-primary bg-primary/5"
                            : "border-border/60 hover:bg-muted/40"
                        }`}
                      >
                        <p className="font-medium">
                          {format(parseISO(entry.weekend_date), "EEEE, MMM d, yyyy")}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {entry.entry_count} entr{entry.entry_count === 1 ? "y" : "ies"} ·{" "}
                          {entry.author_names.slice(0, 2).join(", ")}
                          {entry.author_names.length > 2 ? ` +${entry.author_names.length - 2}` : ""}
                        </p>
                        <div className="mt-2 flex flex-wrap gap-1">
                          {entry.statuses.map((status) => (
                            <Badge key={status} variant="outline" className="text-[10px]">
                              {statusLabel(status)}
                            </Badge>
                          ))}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="space-y-4">
                {selectedWeekendDate && (
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <ClipboardList className="h-4 w-4 text-primary" />
                      <h2 className="font-semibold">
                        {format(parseISO(selectedWeekendDate), "EEEE, MMMM d, yyyy")}
                      </h2>
                    </div>
                    <Button asChild variant="outline" size="sm" className="gap-2">
                      <Link to={`/weekend-rundown?date=${selectedWeekendDate}`}>
                        <Plus className="h-4 w-4" />
                        {detailEntries.some((entry) => entry.user_id === user?.id)
                          ? "Edit my rundown"
                          : "Add my rundown"}
                      </Link>
                    </Button>
                  </div>
                )}

                {detailLoading ? (
                  <p className="text-sm text-muted-foreground">Loading rundown details...</p>
                ) : detailEntries.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No rundown entries for this date.</p>
                ) : (
                  detailEntries.map((entry) => (
                    <Card key={entry.id} className="border-border/60">
                      <CardHeader className="pb-3">
                        <div className="flex flex-wrap items-start gap-3">
                          <Avatar className="h-9 w-9">
                            <AvatarImage src={entry.profile_avatar_url || undefined} />
                            <AvatarFallback>{getInitials(entry.profile_name)}</AvatarFallback>
                          </Avatar>
                          <div className="min-w-0 flex-1">
                            <CardTitle className="text-base">
                              {entry.profile_name || "Unknown leader"}
                            </CardTitle>
                            <CardDescription>
                              Updated {format(new Date(entry.updated_at), "MMM d, yyyy · h:mm a")}
                            </CardDescription>
                          </div>
                          <Badge variant="outline">{statusLabel(entry.overall_status)}</Badge>
                        </div>
                      </CardHeader>
                      <CardContent className="space-y-5">
                        <div className="space-y-2">
                          <div className="flex items-center gap-2 text-sm font-medium">
                            <MessageSquare className="h-4 w-4 text-muted-foreground" />
                            General notes
                          </div>
                          <p className="whitespace-pre-wrap text-sm text-muted-foreground">
                            {entry.notes || "No general notes were added."}
                          </p>
                        </div>

                        {(entry.songFeedback.length > 0 || entry.vocalFeedback.length > 0) && (
                          <>
                            <Separator />
                            <div className="space-y-4">
                              <div className="flex items-center gap-2">
                                <Music2 className="h-4 w-4 text-primary" />
                                <h3 className="font-semibold">Worship Review</h3>
                              </div>

                              {entry.songFeedback.map((songNote) => (
                                <div key={songNote.id} className="rounded-lg border border-border/60 bg-muted/20 p-4">
                                  <div className="mb-2 flex items-center gap-2">
                                    <BookOpenText className="h-4 w-4 text-muted-foreground" />
                                    <p className="font-medium">{songNote.song_title}</p>
                                  </div>
                                  <p className="whitespace-pre-wrap text-sm text-muted-foreground">
                                    {songNote.notes}
                                  </p>
                                </div>
                              ))}

                              {entry.vocalFeedback.length > 0 && (
                                <div className="space-y-3">
                                  <div className="flex items-center gap-2 text-sm font-medium">
                                    <Users className="h-4 w-4 text-muted-foreground" />
                                    Vocalist notes
                                  </div>
                                  {entry.vocalFeedback.map((vocalNote) => (
                                    <div
                                      key={vocalNote.id}
                                      className="rounded-lg border border-border/60 bg-muted/20 p-4"
                                    >
                                      <div className="mb-2 flex flex-wrap items-center gap-2">
                                        <p className="font-medium">{vocalNote.vocalist_name}</p>
                                        <Badge variant="outline" className="text-[10px]">
                                          {vocalNote.song_title}
                                        </Badge>
                                        {vocalNote.fit_label === GOOD_FIT_LABEL && (
                                          <Badge className="bg-emerald-500/15 text-emerald-700 hover:bg-emerald-500/15 dark:text-emerald-300">
                                            Good Fit
                                          </Badge>
                                        )}
                                      </div>
                                      {vocalNote.notes ? (
                                        <p className="whitespace-pre-wrap text-sm text-muted-foreground">
                                          {vocalNote.notes}
                                        </p>
                                      ) : (
                                        <p className="text-sm text-muted-foreground">No written notes.</p>
                                      )}
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          </>
                        )}
                      </CardContent>
                    </Card>
                  ))
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
