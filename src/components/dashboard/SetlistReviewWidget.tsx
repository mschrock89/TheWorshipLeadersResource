import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { format, parseISO } from "date-fns";
import { Clock, FileText, MapPin, Youtube } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { ChordChartDialog } from "@/components/songs/ChordChartDialog";
import { MINISTRY_TYPES } from "@/lib/constants";
import { supabase } from "@/integrations/supabase/client";
import { isMissingYoutubeUrlColumnError } from "@/lib/youtube";
import { useApproveSetlist, usePendingApprovals, useRejectSetlist } from "@/hooks/useSetlistApprovals";

interface SetlistReviewWidgetProps {
  selectedCampusId: string;
}

interface ApprovedSetlistSong {
  id: string;
  song_id: string | null;
  sequence_order: number;
  song_key: string | null;
  youtube_url?: string | null;
  songs: { title: string; author: string | null } | null;
  vocalist?: { full_name: string | null; avatar_url?: string | null } | null;
}

interface ApprovedSetlist {
  id: string;
  campus_id: string;
  plan_date: string;
  ministry_type: string;
  notes: string | null;
  status: string;
  published_at: string | null;
  campuses: { name: string } | null;
  draft_set_songs: ApprovedSetlistSong[];
}

function YouTubeButton({ href }: { href: string | null | undefined }) {
  if (!href) return null;

  return (
    <Button
      asChild
      type="button"
      variant="outline"
      size="sm"
      className="h-6 gap-1 rounded-full border-red-500/50 bg-red-500/10 px-2 text-[11px] font-medium text-red-400 hover:bg-red-500/20 hover:text-red-300 shrink-0"
    >
      <a href={href} target="_blank" rel="noopener noreferrer">
        <Youtube className="h-3 w-3" />
        YouTube
      </a>
    </Button>
  );
}

function getSetlistDisplayDate(planDate: string, ministryType: string) {
  const date = new Date(`${planDate}T00:00:00`);
  if (Number.isNaN(date.getTime())) return planDate;

  if (["weekend", "weekend_team", "sunday_am"].includes(ministryType)) {
    const day = date.getDay();
    const saturday = new Date(date);
    if (day === 0) saturday.setDate(date.getDate() - 1);
    const sunday = new Date(saturday);
    sunday.setDate(saturday.getDate() + 1);
    return `${format(saturday, "EEEE, MMMM d")} - ${format(sunday, "EEEE, MMMM d, yyyy")}`;
  }

  return format(date, "EEEE, MMMM d, yyyy");
}

function getMinistryLabel(type: string) {
  return MINISTRY_TYPES.find((m) => m.value === type)?.label || type;
}

export function SetlistReviewWidget({ selectedCampusId }: SetlistReviewWidgetProps) {
  const today = new Date().toISOString().split("T")[0];
  const approveSetlist = useApproveSetlist();
  const rejectSetlist = useRejectSetlist();
  const { data: pendingApprovals = [], isLoading: loadingPending, error: pendingError } = usePendingApprovals();
  const [rejectNotesBySetId, setRejectNotesBySetId] = useState<Record<string, string>>({});
  const [chartSong, setChartSong] = useState<{ id: string; title: string; author: string | null; draftSetSongId?: string | null; originalKey?: string | null } | null>(null);

  const { data: approvedSetlists = [], isLoading: loadingApproved, error: approvedError } = useQuery({
    queryKey: ["dashboard-approver-published-setlists", selectedCampusId, today],
    queryFn: async () => {
      const primaryQuery = supabase
        .from("draft_sets")
        .select(`
          id,
          campus_id,
          plan_date,
          ministry_type,
          notes,
          status,
          published_at,
          campuses(name),
          draft_set_songs(
            id,
            song_id,
            sequence_order,
            song_key,
            youtube_url,
            songs(title, author),
            vocalist:profiles!draft_set_songs_vocalist_id_fkey(id, full_name, avatar_url)
          )
        `)
        .eq("status", "published")
        .gte("plan_date", today)
        .order("plan_date", { ascending: true });

      const scopedQuery = selectedCampusId === "all" ? primaryQuery : primaryQuery.eq("campus_id", selectedCampusId);
      let { data, error } = await scopedQuery;

      if (error && isMissingYoutubeUrlColumnError(error)) {
        const legacyQuery = supabase
          .from("draft_sets")
          .select(`
            id,
            campus_id,
            plan_date,
            ministry_type,
            notes,
            status,
            published_at,
            campuses(name),
            draft_set_songs(
              id,
              song_id,
              sequence_order,
              song_key,
              songs(title, author),
              vocalist:profiles!draft_set_songs_vocalist_id_fkey(id, full_name, avatar_url)
            )
          `)
          .eq("status", "published")
          .gte("plan_date", today)
          .order("plan_date", { ascending: true });

        ({ data, error } = await (selectedCampusId === "all" ? legacyQuery : legacyQuery.eq("campus_id", selectedCampusId)));
      }

      if (error) throw error;
      return (data || []) as ApprovedSetlist[];
    },
  });

  const filteredPendingApprovals = useMemo(() => {
    return pendingApprovals.filter((approval) => {
      if (!approval.draft_set?.plan_date || approval.draft_set.plan_date < today) return false;
      if (selectedCampusId !== "all" && approval.draft_set.campus_id !== selectedCampusId) return false;
      return true;
    });
  }, [pendingApprovals, selectedCampusId, today]);

  const handleReject = async (approvalId: string, draftSetId: string) => {
    const notes = (rejectNotesBySetId[draftSetId] || "").trim();
    if (!notes) return;
    await rejectSetlist.mutateAsync({ approvalId, draftSetId, notes });
    setRejectNotesBySetId((prev) => ({ ...prev, [draftSetId]: "" }));
  };

  const isLoading = loadingPending || loadingApproved;
  const hasError = pendingError || approvedError;

  return (
    <section className="mb-8 space-y-4">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h2 className="font-display text-xl font-semibold text-foreground">Setlist Review</h2>
          <p className="mt-1 text-muted-foreground">
            Review incoming drafts and keep an eye on published sets from the dashboard.
          </p>
        </div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <MapPin className="h-4 w-4" />
          <span>{selectedCampusId === "all" ? "All campuses" : "Selected campus"}</span>
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-4">
          {[1, 2].map((i) => <Skeleton key={i} className="h-44 w-full" />)}
        </div>
      ) : hasError ? (
        <Card>
          <CardContent className="py-6 text-sm text-destructive">
            Unable to load setlist review data. Please refresh and try again.
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold">Drafts Awaiting Approval</h3>
              <Badge variant="secondary">{filteredPendingApprovals.length}</Badge>
            </div>

            {filteredPendingApprovals.length === 0 ? (
              <Card>
                <CardContent className="py-6 text-sm text-muted-foreground">No upcoming drafts awaiting approval.</CardContent>
              </Card>
            ) : (
              filteredPendingApprovals.map((approval) => (
                <Card key={approval.id}>
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <CardTitle className="text-lg">
                          {getSetlistDisplayDate(approval.draft_set.plan_date, approval.draft_set.ministry_type)}
                        </CardTitle>
                        <div className="mt-2 flex flex-wrap items-center gap-1.5">
                          <Badge variant="secondary">{getMinistryLabel(approval.draft_set.ministry_type)}</Badge>
                          {approval.draft_set.campuses?.name ? <Badge variant="outline">{approval.draft_set.campuses.name}</Badge> : null}
                        </div>
                        <p className="mt-2 text-sm text-muted-foreground">
                          Submitted by {approval.submitter?.full_name || "Unknown"} on {format(parseISO(approval.submitted_at), "MMM d 'at' h:mm a")}
                        </p>
                      </div>
                      <Badge className="gap-1 bg-amber-600 text-white">
                        <Clock className="h-3 w-3" />
                        Pending
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-2">
                      {(approval.songs || []).map((song, index) => (
                        <div key={song.id} className="rounded-md bg-muted/50 p-2 text-sm flex items-center justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <button
                              type="button"
                              className="truncate text-left hover:text-primary hover:underline disabled:cursor-not-allowed disabled:no-underline disabled:opacity-70"
                              disabled={!song.song_id}
                              onClick={() => {
                                if (!song.song_id) return;
                                setChartSong({
                                  id: song.song_id,
                                  title: song.song?.title || "Unknown Song",
                                  author: song.song?.author || null,
                                  draftSetSongId: song.id,
                                  originalKey: song.song_key || null,
                                });
                              }}
                            >
                              {index + 1}. {song.song?.title || "Unknown Song"}
                            </button>
                            {song.vocalist?.full_name ? (
                              <p className="text-xs text-muted-foreground truncate">
                                Vocalist: {song.vocalist.full_name}
                              </p>
                            ) : null}
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            {song.song_key ? <Badge variant="outline" className="text-xs shrink-0">{song.song_key}</Badge> : null}
                            {song.song_id ? (
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="h-7 gap-1 px-2 text-xs shrink-0"
                                onClick={() =>
                                  setChartSong({
                                    id: song.song_id,
                                    title: song.song?.title || "Unknown Song",
                                    author: song.song?.author || null,
                                    draftSetSongId: song.id,
                                    originalKey: song.song_key || null,
                                  })
                                }
                              >
                                <FileText className="h-3.5 w-3.5" />
                                Chart
                              </Button>
                            ) : null}
                          </div>
                        </div>
                      ))}
                    </div>

                    <div className="space-y-2">
                      <p className="text-xs font-medium text-muted-foreground">Revision message (required to deny)</p>
                      <Textarea
                        value={rejectNotesBySetId[approval.draft_set_id] || ""}
                        onChange={(e) => setRejectNotesBySetId((prev) => ({ ...prev, [approval.draft_set_id]: e.target.value }))}
                        placeholder="Tell the worship pastor what needs to change..."
                        className="min-h-[80px]"
                      />
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <Button
                        className="bg-green-600 hover:bg-green-700 text-white"
                        disabled={approveSetlist.isPending}
                        onClick={() => approveSetlist.mutate({ approvalId: approval.id, draftSetId: approval.draft_set_id })}
                      >
                        Approve Setlist
                      </Button>
                      <Button
                        variant="outline"
                        className="border-destructive text-destructive hover:bg-destructive/10"
                        disabled={rejectSetlist.isPending || !(rejectNotesBySetId[approval.draft_set_id] || "").trim()}
                        onClick={() => handleReject(approval.id, approval.draft_set_id)}
                      >
                        Request Changes
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold">Upcoming Published Setlists</h3>
              <Badge variant="secondary">{approvedSetlists.length}</Badge>
            </div>

            {approvedSetlists.length === 0 ? (
              <Card>
                <CardContent className="py-6 text-sm text-muted-foreground">No upcoming published setlists for this campus filter.</CardContent>
              </Card>
            ) : (
              approvedSetlists.map((setlist) => (
                <Card key={setlist.id}>
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <CardTitle className="text-lg">
                          {getSetlistDisplayDate(setlist.plan_date, setlist.ministry_type)}
                        </CardTitle>
                        <div className="mt-2 flex flex-wrap items-center gap-1.5">
                          <Badge variant="secondary">{getMinistryLabel(setlist.ministry_type)}</Badge>
                          {setlist.campuses?.name ? <Badge variant="outline">{setlist.campuses.name}</Badge> : null}
                        </div>
                        {setlist.published_at ? (
                          <p className="mt-2 text-sm text-muted-foreground">
                            Published {format(parseISO(setlist.published_at), "MMM d 'at' h:mm a")}
                          </p>
                        ) : null}
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="space-y-2">
                      {(setlist.draft_set_songs || [])
                        .slice()
                        .sort((a, b) => a.sequence_order - b.sequence_order)
                        .map((song, index) => (
                          <div key={song.id} className="rounded-md bg-muted/50 p-2 text-sm flex items-center justify-between gap-3">
                            <div className="min-w-0 flex-1">
                              <button
                                type="button"
                                className="truncate text-left hover:text-primary hover:underline disabled:cursor-not-allowed disabled:no-underline disabled:opacity-70"
                                disabled={!song.song_id}
                                onClick={() => {
                                  if (!song.song_id) return;
                                  setChartSong({
                                    id: song.song_id,
                                    title: song.songs?.title || "Unknown Song",
                                    author: song.songs?.author || null,
                                    draftSetSongId: song.id,
                                    originalKey: song.song_key || null,
                                  });
                                }}
                              >
                                {index + 1}. {song.songs?.title || "Unknown Song"}
                              </button>
                              {song.songs?.author ? <p className="text-xs text-muted-foreground truncate">{song.songs.author}</p> : null}
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              {song.song_key ? <Badge variant="outline" className="text-xs shrink-0">{song.song_key}</Badge> : null}
                              {song.song_id ? (
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  className="h-7 gap-1 px-2 text-xs shrink-0"
                                  onClick={() =>
                                    setChartSong({
                                      id: song.song_id,
                                      title: song.songs?.title || "Unknown Song",
                                      author: song.songs?.author || null,
                                      draftSetSongId: song.id,
                                      originalKey: song.song_key || null,
                                    })
                                  }
                                >
                                  <FileText className="h-3.5 w-3.5" />
                                  Chart
                                </Button>
                              ) : null}
                              <YouTubeButton href={song.youtube_url} />
                            </div>
                          </div>
                        ))}
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        </>
      )}

      <ChordChartDialog
        open={!!chartSong}
        onOpenChange={(open) => !open && setChartSong(null)}
        song={chartSong}
      />
    </section>
  );
}
