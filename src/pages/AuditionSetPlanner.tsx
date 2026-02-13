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

const LEADER_ROLES = [
  "admin",
  "campus_admin",
  "network_worship_pastor",
  "campus_worship_pastor",
  "student_worship_pastor",
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

      const { data, error } = await supabase
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
            songs(title, author)
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
          ...songAvail,
          selectedKey: dss.song_key,
          selectedVocalistIds: [],
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

      if (playlistError) throw playlistError;

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
    <div className="space-y-6">
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

      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <ListMusic className="h-6 w-6" />
            Audition Setlist Planner
          </h1>
          <p className="text-sm text-muted-foreground flex items-center gap-2 mt-1">
            <UserRound className="h-4 w-4" />
            {profile?.full_name || "Candidate"}
          </p>
        </div>
        <div className="flex gap-2">
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

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <CalendarClock className="h-4 w-4" />
            Audition Details
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
          <div className="space-y-2">
            <Label>Campus</Label>
            <Select value={selectedCampusId} onValueChange={setSelectedCampusId}>
              <SelectTrigger>
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

          <div className="space-y-2">
            <Label>Date</Label>
            <Input type="date" value={selectedDateStr} onChange={(e) => setSelectedDateStr(e.target.value)} />
          </div>

          <div className="space-y-2">
            <Label>Start Time</Label>
            <Input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
          </div>

          <div className="space-y-2">
            <Label>End Time</Label>
            <Input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
          </div>

          <div className="space-y-2 lg:col-span-1 md:col-span-2">
            <Label>Candidate Notes</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Audition details, prep instructions, what to focus on..."
              className="min-h-[80px]"
            />
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="min-h-[520px]">
          <CardHeader>
            <CardTitle className="text-base">Song Library</CardTitle>
          </CardHeader>
          <CardContent className="h-[460px]">
            <SongAvailabilityList
              availability={availability}
              onAddSong={handleAddSong}
              addedSongIds={addedSongIds}
              isLoading={songsLoading || existingSetLoading}
            />
          </CardContent>
        </Card>

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

      {playlistForThisSet.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-lg font-semibold">Practice Playlist</h2>
          {playlistForThisSet.map((playlist) => (
            <SetlistPlaylistCard key={playlist.id} playlist={playlist} />
          ))}
        </div>
      )}
    </div>
  );
}
