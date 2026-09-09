import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { Home, ListMusic, Save, Send, UserRound, CalendarClock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useUserRoles } from "@/hooks/useUserRoles";
import { useProfile } from "@/hooks/useProfiles";
import { useCandidateAudition } from "@/hooks/useAuditions";
import { useCampuses } from "@/hooks/useCampuses";
import { useSongAvailability, useSaveDraftSet, SongAvailability } from "@/hooks/useSetPlanner";
import { useMySetlistPlaylists } from "@/hooks/useSetlistPlaylists";
import { SetlistPlaylistCard } from "@/components/audio/SetlistPlaylistCard";
import { SongAvailabilityList } from "@/components/set-planner/SongAvailabilityList";
import { BuildingSet, BuildingSetSong } from "@/components/set-planner/BuildingSet";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { isMissingYoutubeUrlColumnError } from "@/lib/youtube";

const LEADER_ROLES = [
  "admin",
  "campus_admin",
  "network_worship_pastor",
  "campus_worship_pastor",
  "network_student_pastor",
  "student_pastor",
  "student_worship_pastor",
  "childrens_pastor",
  "network_worship_leader",
] as const;

export default function AuditionSetPlanner() {
  const { candidateId } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { toast } = useToast();

  const { data: profile } = useProfile(candidateId);
  const { data: candidateAudition } = useCandidateAudition(candidateId);
  const { data: campuses = [] } = useCampuses();
  const { data: currentUserRoles = [], isLoading: rolesLoading } = useUserRoles(user?.id);
  const { data: playlists = [] } = useMySetlistPlaylists();

  const canManageAuditions = currentUserRoles.some((r) =>
    LEADER_ROLES.includes(r.role as (typeof LEADER_ROLES)[number]),
  );

  const [selectedCampusId, setSelectedCampusId] = useState<string>("");
  const [selectedDateStr, setSelectedDateStr] = useState<string>(format(new Date(), "yyyy-MM-dd"));
  const [startTime, setStartTime] = useState<string>("");
  const [endTime, setEndTime] = useState<string>("");
  const [notes, setNotes] = useState<string>("");
  const [selectedSetId, setSelectedSetId] = useState<string | null>(null);
  const [buildingSongs, setBuildingSongs] = useState<BuildingSetSong[]>([]);

  useEffect(() => {
    if (!candidateAudition) return;
    setSelectedCampusId(candidateAudition.campus_id || campuses[0]?.id || "");
    setSelectedDateStr(candidateAudition.audition_date || format(new Date(), "yyyy-MM-dd"));
    setStartTime(candidateAudition.start_time || "");
    setEndTime(candidateAudition.end_time || "");
    setNotes(candidateAudition.notes || "");
  }, [candidateAudition, campuses]);

  useEffect(() => {
    if (!selectedCampusId && campuses[0]?.id) {
      setSelectedCampusId(campuses[0].id);
    }
  }, [selectedCampusId, campuses]);

  const selectedDate = useMemo(() => {
    const parsed = new Date(`${selectedDateStr}T12:00:00`);
    return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
  }, [selectedDateStr]);

  const { availability, isLoading: songsLoading } = useSongAvailability(
    selectedCampusId || null,
    "audition",
    selectedDate,
  );

  const { data: existingSet, isLoading: existingSetLoading } = useQuery({
    queryKey: ["audition-set-for-candidate", candidateId, selectedCampusId, selectedDateStr],
    enabled: !!candidateId && !!selectedCampusId && !!selectedDateStr,
    queryFn: async () => {
      const { data: assignments, error: assignmentsError } = await supabase
        .from("audition_setlist_assignments")
        .select("draft_set_id")
        .eq("user_id", candidateId!);

      if (assignmentsError) throw assignmentsError;

      const assignedSetIds = (assignments || []).map((a) => a.draft_set_id);
      if (assignedSetIds.length === 0) return null;

      const primaryQuery = await supabase
        .from("draft_sets")
        .select(
          `
          id,
          campus_id,
          plan_date,
          ministry_type,
          notes,
          status,
          published_at,
          draft_set_songs(
            id,
            song_id,
            sequence_order,
            song_key,
            youtube_url,
            songs(title, author, bpm)
          )
        `,
        )
        .in("id", assignedSetIds)
        .eq("campus_id", selectedCampusId)
        .eq("plan_date", selectedDateStr)
        .eq("ministry_type", "audition")
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      let data = primaryQuery.data;
      let error = primaryQuery.error;

      if (error && isMissingYoutubeUrlColumnError(error)) {
        const legacyQuery = await supabase
          .from("draft_sets")
          .select(
            `
            id,
            campus_id,
            plan_date,
            ministry_type,
            notes,
            status,
            published_at,
            draft_set_songs(
              id,
              song_id,
              sequence_order,
              song_key,
              songs(title, author, bpm)
            )
          `,
          )
          .in("id", assignedSetIds)
          .eq("campus_id", selectedCampusId)
          .eq("plan_date", selectedDateStr)
          .eq("ministry_type", "audition")
          .order("updated_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        data = legacyQuery.data;
        error = legacyQuery.error;
      }

      if (error) throw error;
      return data;
    },
  });

  useEffect(() => {
    if (existingSetLoading || !availability || availability.length === 0) return;

    if (!existingSet) {
      setSelectedSetId(null);
      setBuildingSongs([]);
      return;
    }

    const existingSongs = (existingSet.draft_set_songs || [])
      .slice()
      .sort((a: any, b: any) => a.sequence_order - b.sequence_order)
      .map((dss: any) => {
        const songAvail = availability.find((a) => a.song.id === dss.song_id);
        if (!songAvail) return null;
        return {
          ...(songAvail ?? {
            song: {
              id: dss.song_id,
              pco_song_id: null,
              title: dss.songs?.title || "Unknown Song",
              author: dss.songs?.author || null,
              ccli_number: null,
              bpm: dss.songs?.bpm ?? null,
              created_at: "",
              updated_at: "",
              usage_count: 0,
              first_used: null,
              last_used: null,
              upcoming_uses: 0,
              usages: [],
            },
            status: "available" as const,
            weeksUntilAvailable: null,
            lastUsedDate: null,
            totalUses: 0,
            isNewSong: false,
            isGloballyNew: false,
            isDeepCut: false,
            isInRegularRotation: false,
            usesInPastYear: 0,
            scheduledDates: [],
            suggestedKey: null,
          }),
          selectedKey: dss.song_key,
          selectedVocalistIds: [],
          youtubeUrl: dss.youtube_url || null,
        } as BuildingSetSong;
      })
      .filter(Boolean) as BuildingSetSong[];

    setSelectedSetId(existingSet.id);
    setBuildingSongs(existingSongs);
    setNotes(existingSet.notes || "");
  }, [existingSet, existingSetLoading, availability]);

  const saveDraftSet = useSaveDraftSet();

  const publishAuditionSet = useMutation({
    mutationFn: async () => {
      if (!user?.id || !candidateId || !selectedCampusId) {
        throw new Error("Missing required information");
      }

      const draftSetId = await saveDraftSet.mutateAsync({
        draftSet: {
          id: selectedSetId || undefined,
          campus_id: selectedCampusId,
          plan_date: selectedDateStr,
          ministry_type: "audition",
          created_by: user.id,
          status: "published",
          notes: notes || null,
        },
        songs: buildingSongs.map((s, index) => ({
          song_id: s.song.id,
          sequence_order: index,
          song_key: s.selectedKey || null,
          youtube_url: s.youtubeUrl || null,
          vocalist_ids: [],
        })),
      });

      const { error: publishError } = await supabase
        .from("draft_sets")
        .update({ status: "published", published_at: new Date().toISOString(), notes: notes || null })
        .eq("id", draftSetId);

      if (publishError) throw publishError;

      const { error: assignError } = await supabase
        .from("audition_setlist_assignments")
        .upsert(
          {
            draft_set_id: draftSetId,
            user_id: candidateId,
            assigned_by: user.id,
          },
          { onConflict: "draft_set_id,user_id" },
        );

      if (assignError) throw assignError;

      // Some leadership roles can publish audition sets but are not allowed to upsert
      // setlist_playlists via current RLS policies. Publish/assign should still succeed.
      const { error: playlistError } = await supabase
        .from("setlist_playlists")
        .upsert(
          {
            draft_set_id: draftSetId,
            campus_id: selectedCampusId,
            service_date: selectedDateStr,
            ministry_type: "audition",
          },
          { onConflict: "draft_set_id" },
        );
      if (playlistError) {
        const message = playlistError.message || "";
        const isRlsDenied =
          playlistError.code === "42501" ||
          message.toLowerCase().includes("row-level security");
        if (!isRlsDenied) {
          throw playlistError;
        }
      }

      const notificationResponse = await supabase.functions.invoke("notify-setlist-published", {
        body: { draftSetId },
      });

      if (notificationResponse.error) {
        console.error("Failed to notify published audition setlist roster:", notificationResponse.error);
      }

      if (candidateAudition?.id) {
        const { error: auditionUpdateError } = await supabase
          .from("auditions")
          .update({
            audition_date: selectedDateStr,
            campus_id: selectedCampusId,
            start_time: startTime || null,
            end_time: endTime || null,
            stage: "audition",
            status: "scheduled",
            notes: notes || null,
          })
          .eq("id", candidateAudition.id);

        if (auditionUpdateError) throw auditionUpdateError;
      } else {
        const { error: auditionCreateError } = await supabase.from("auditions").insert({
          candidate_id: candidateId,
          campus_id: selectedCampusId,
          audition_date: selectedDateStr,
          start_time: startTime || null,
          end_time: endTime || null,
          stage: "audition",
          candidate_track: "vocalist",
          status: "scheduled",
          created_by: user.id,
          notes: notes || null,
        });

        if (auditionCreateError) throw auditionCreateError;
      }

      return draftSetId;
    },
    onSuccess: (draftSetId) => {
      setSelectedSetId(draftSetId);
      queryClient.invalidateQueries({ queryKey: ["audition-set-for-candidate", candidateId] });
      queryClient.invalidateQueries({ queryKey: ["published-setlists"] });
      queryClient.invalidateQueries({ queryKey: ["setlist-playlists"] });
      queryClient.invalidateQueries({ queryKey: ["candidate-audition", candidateId] });
      toast({
        title: "Audition setlist published",
        description: "The candidate can now review and confirm this audition setlist.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Unable to publish audition setlist",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const saveAsDraft = useMutation({
    mutationFn: async () => {
      if (!user?.id || !candidateId || !selectedCampusId) {
        throw new Error("Missing required information");
      }

      const draftSetId = await saveDraftSet.mutateAsync({
        draftSet: {
          id: selectedSetId || undefined,
          campus_id: selectedCampusId,
          plan_date: selectedDateStr,
          ministry_type: "audition",
          created_by: user.id,
          status: "draft",
          notes: notes || null,
        },
        songs: buildingSongs.map((s, index) => ({
          song_id: s.song.id,
          sequence_order: index,
          song_key: s.selectedKey || null,
          youtube_url: s.youtubeUrl || null,
          vocalist_ids: [],
        })),
      });

      const { error: assignError } = await supabase
        .from("audition_setlist_assignments")
        .upsert(
          {
            draft_set_id: draftSetId,
            user_id: candidateId,
            assigned_by: user.id,
          },
          { onConflict: "draft_set_id,user_id" },
        );

      if (assignError) throw assignError;
      return draftSetId;
    },
    onSuccess: (draftSetId) => {
      setSelectedSetId(draftSetId);
      queryClient.invalidateQueries({ queryKey: ["audition-set-for-candidate", candidateId] });
      toast({ title: "Draft saved", description: "Audition setlist draft saved." });
    },
    onError: (error: Error) => {
      toast({ title: "Unable to save draft", description: error.message, variant: "destructive" });
    },
  });

  const addedSongIds = useMemo(() => new Set(buildingSongs.map((s) => s.song.id)), [buildingSongs]);
  const hasConflicts = useMemo(() => buildingSongs.some((s) => s.status === "too-recent"), [buildingSongs]);

  const playlistForThisSet = playlists.filter((p) => p.draft_set_id === selectedSetId);

  const handleAddSong = (song: SongAvailability) => {
    if (addedSongIds.has(song.song.id)) return;
    setBuildingSongs((prev) => [...prev, { ...song, selectedKey: song.suggestedKey }]);
  };

  const handleRemoveSong = (songId: string) => {
    setBuildingSongs((prev) => prev.filter((s) => s.song.id !== songId));
  };

  if (!candidateId) {
    return (
      <Card>
        <CardContent className="py-8">Missing candidate ID.</CardContent>
      </Card>
    );
  }

  if (!rolesLoading && !canManageAuditions) {
    return (
      <Card>
        <CardContent className="py-8 text-sm text-muted-foreground">
          You do not have access to manage audition setlists.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="w-full min-w-0 space-y-6 overflow-x-hidden">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link to="/dashboard" className="flex items-center gap-1.5">
                <Home className="h-3.5 w-3.5" />
                Dashboard
              </Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link to={`/team/${candidateId}`}>Candidate Profile</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>Audition Setlist</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="flex min-w-0 flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <ListMusic className="h-6 w-6 shrink-0" />
            Audition Setlist Planner
          </h1>
          <p className="mt-1 flex min-w-0 items-center gap-2 text-sm text-muted-foreground">
            <UserRound className="h-4 w-4 shrink-0" />
            <span className="truncate">{profile?.full_name || "Candidate"}</span>
          </p>
        </div>
        <div className="flex min-w-0 flex-wrap gap-2">
          <Button variant="outline" onClick={() => navigate(`/team/${candidateId}`)}>
            Back to Profile
          </Button>
          <Button
            onClick={() => saveAsDraft.mutate()}
            disabled={saveAsDraft.isPending || buildingSongs.length === 0 || !selectedCampusId}
            variant="outline"
            className="gap-2"
          >
            <Save className="h-4 w-4" />
            Save Draft
          </Button>
          <Button
            onClick={() => publishAuditionSet.mutate()}
            disabled={publishAuditionSet.isPending || buildingSongs.length === 0 || !selectedCampusId}
            className="gap-2"
          >
            <Send className="h-4 w-4" />
            Publish & Assign
          </Button>
        </div>
      </div>

      <Card className="min-w-0 overflow-hidden">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <CalendarClock className="h-4 w-4" />
            Audition Details
          </CardTitle>
        </CardHeader>
        <CardContent className="grid min-w-0 gap-4 sm:grid-cols-2 xl:grid-cols-[repeat(4,minmax(0,1fr))_minmax(0,1.4fr)]">
          <div className="min-w-0 space-y-2">
            <Label>Campus</Label>
            <Select value={selectedCampusId} onValueChange={setSelectedCampusId}>
              <SelectTrigger className="min-w-0">
                <SelectValue placeholder="Select campus" />
              </SelectTrigger>
              <SelectContent>
                {campuses.map((campus) => (
                  <SelectItem key={campus.id} value={campus.id}>
                    {campus.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="min-w-0 space-y-2">
            <Label>Date</Label>
            <Input
              type="date"
              value={selectedDateStr}
              onChange={(e) => setSelectedDateStr(e.target.value)}
              className="audition-date-input min-w-0"
            />
          </div>

          <div className="min-w-0 space-y-2">
            <Label>Start Time</Label>
            <Input
              type="time"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
              className="audition-time-input min-w-0"
            />
          </div>

          <div className="min-w-0 space-y-2">
            <Label>End Time</Label>
            <Input
              type="time"
              value={endTime}
              onChange={(e) => setEndTime(e.target.value)}
              className="audition-time-input min-w-0"
            />
          </div>

          <div className="min-w-0 space-y-2 sm:col-span-2 xl:col-span-1">
            <Label>Candidate Notes</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Audition details, prep instructions, what to focus on..."
              className="min-h-[80px] min-w-0"
            />
          </div>
        </CardContent>
      </Card>

      {/* Two panels. On desktop, lock both to the viewport so My Set stays visible
          while Song Library scrolls inside its own panel — same bounding as Set Builder. */}
      <div className="flex min-w-0 flex-col gap-4 lg:grid lg:h-[calc(100dvh-5.5rem)] lg:min-h-[520px] lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:items-stretch">
        <Card className="flex h-[70dvh] min-h-[400px] min-w-0 flex-col overflow-hidden lg:h-full lg:min-h-0">
          <CardHeader className="shrink-0 pb-3">
            <CardTitle className="text-base">Song Library</CardTitle>
          </CardHeader>
          <CardContent className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden pb-4">
            <SongAvailabilityList
              availability={availability}
              onAddSong={handleAddSong}
              addedSongIds={addedSongIds}
              isLoading={songsLoading || existingSetLoading}
              referenceDate={selectedDate}
            />
          </CardContent>
        </Card>

        <div className="min-h-0 min-w-0 lg:h-full lg:overflow-hidden">
          <BuildingSet
            songs={buildingSongs}
          onRemoveSong={handleRemoveSong}
          onReorderSongs={setBuildingSongs}
          onKeyChange={(songId, key) => {
            setBuildingSongs((prev) => prev.map((s) => (s.song.id === songId ? { ...s, selectedKey: key } : s)));
          }}
          onVocalistChange={() => {
            // Audition setlists do not need vocalist assignments.
          }}
          onYoutubeLinkChange={(songId, youtubeUrl) => {
            setBuildingSongs((prev) => prev.map((s) => (s.song.id === songId ? { ...s, youtubeUrl } : s)));
          }}
          onSave={() => saveAsDraft.mutate()}
          isSaving={saveAsDraft.isPending}
          notes={notes}
          onNotesChange={setNotes}
          hasConflicts={hasConflicts}
          vocalists={[]}
          publishButton={
            <Button
              onClick={() => publishAuditionSet.mutate()}
              disabled={publishAuditionSet.isPending || buildingSongs.length === 0 || !selectedCampusId}
              size="sm"
              className="gap-2"
            >
              <Send className="h-4 w-4" />
              Publish
            </Button>
          }
          isPublished={existingSet?.status === "published"}
          approvalStatus={existingSet?.status === "published" ? "published" : "draft"}
          rejectionNotes={null}
        />
        </div>
      </div>

      {playlistForThisSet.length > 0 && (
        <div className="min-w-0 space-y-3 overflow-x-hidden">
          <h2 className="text-lg font-semibold">Our Versions</h2>
          {playlistForThisSet.map((playlist) => (
            <SetlistPlaylistCard key={playlist.id} playlist={playlist} />
          ))}
        </div>
      )}
    </div>
  );
}
