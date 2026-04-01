import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { getWeekendPlanDate, GOOD_FIT_LABEL } from "@/lib/weekendRundown";

type WeekendRundownStatus = "no_issues" | "minor_issues" | "no_distractions" | "dumpster_fire";

export interface WeekendRundownRow {
  id: string;
  campus_id: string;
  weekend_date: string;
  user_id: string;
  overall_status: WeekendRundownStatus;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface WeekendRundownSongFeedbackRow {
  id: string;
  rundown_id: string;
  song_id: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface WeekendRundownVocalFeedbackRow {
  id: string;
  rundown_id: string;
  song_id: string;
  vocalist_id: string;
  fit_label: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface WeekendRundownEntry extends WeekendRundownRow {
  profile_name: string | null;
  profile_avatar_url: string | null;
}

export interface WeekendRundownSetSong {
  draft_set_song_id: string;
  song_id: string;
  title: string;
  sequence_order: number;
  vocalist_ids: string[];
  vocalists: Array<{ id: string; name: string }>;
}

interface WeekendRundownPayload {
  campusId: string;
  weekendDate: string;
  overallStatus: WeekendRundownStatus;
  notes: string;
  songFeedback: Array<{
    song_id: string;
    notes: string;
  }>;
  vocalFeedback: Array<{
    song_id: string;
    vocalist_id: string;
    fit_label: string | null;
    notes: string;
  }>;
}

interface DraftSetSongRow {
  id: string;
  song_id: string;
  sequence_order: number;
  vocalist_id?: string | null;
  songs?: { id: string; title: string } | null;
}

export function useWeekendRundown(userId: string | undefined, campusId: string | null, weekendDate: string | null) {
  return useQuery({
    queryKey: ["weekend-rundown", userId, campusId, weekendDate],
    queryFn: async () => {
      if (!userId || !campusId || !weekendDate) return null;

      const { data: rundown, error: rundownError } = await supabase
        .from("weekend_rundowns")
        .select("*")
        .eq("user_id", userId)
        .eq("campus_id", campusId)
        .eq("weekend_date", weekendDate)
        .maybeSingle();

      if (rundownError) throw rundownError;
      if (!rundown) return null;

      const [{ data: songFeedback, error: songError }, { data: vocalFeedback, error: vocalError }] = await Promise.all([
        supabase
          .from("weekend_rundown_song_feedback")
          .select("*")
          .eq("rundown_id", rundown.id),
        supabase
          .from("weekend_rundown_vocal_feedback")
          .select("*")
          .eq("rundown_id", rundown.id),
      ]);

      if (songError) throw songError;
      if (vocalError) throw vocalError;

      return {
        rundown: rundown as WeekendRundownRow,
        songFeedback: (songFeedback || []) as WeekendRundownSongFeedbackRow[],
        vocalFeedback: (vocalFeedback || []) as WeekendRundownVocalFeedbackRow[],
      };
    },
    enabled: !!userId && !!campusId && !!weekendDate,
  });
}

export function useWeekendRundownEntries(campusId: string | null, weekendDate: string | null) {
  return useQuery({
    queryKey: ["weekend-rundown-entries", campusId, weekendDate],
    queryFn: async () => {
      if (!campusId || !weekendDate) return [];

      const { data: rundowns, error } = await supabase
        .from("weekend_rundowns")
        .select("id, campus_id, weekend_date, user_id, overall_status, notes, created_at, updated_at")
        .eq("campus_id", campusId)
        .eq("weekend_date", weekendDate)
        .order("updated_at", { ascending: false });

      if (error) throw error;

      const userIds = Array.from(new Set((rundowns || []).map((entry) => entry.user_id)));
      if (userIds.length === 0) {
        return [] as WeekendRundownEntry[];
      }

      const { data: profiles, error: profilesError } = await supabase
        .from("profiles")
        .select("id, full_name, avatar_url")
        .in("id", userIds);

      if (profilesError) throw profilesError;

      const profileMap = new Map(
        (profiles || []).map((profile) => [profile.id, profile]),
      );

      return (rundowns || []).map((entry) => ({
        ...(entry as WeekendRundownRow),
        profile_name: profileMap.get(entry.user_id)?.full_name || null,
        profile_avatar_url: profileMap.get(entry.user_id)?.avatar_url || null,
      })) as WeekendRundownEntry[];
    },
    enabled: !!campusId && !!weekendDate,
  });
}

export function useSaveWeekendRundown(userId: string | undefined) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (payload: WeekendRundownPayload) => {
      if (!userId) {
        throw new Error("You must be signed in to save a weekend rundown.");
      }

      const { data: rundown, error: rundownError } = await supabase
        .from("weekend_rundowns")
        .upsert(
          {
            user_id: userId,
            campus_id: payload.campusId,
            weekend_date: payload.weekendDate,
            overall_status: payload.overallStatus,
            notes: payload.notes.trim() || null,
          },
          { onConflict: "user_id,campus_id,weekend_date" },
        )
        .select("*")
        .single();

      if (rundownError) throw rundownError;

      const rundownId = rundown.id;

      await Promise.all([
        supabase.from("weekend_rundown_song_feedback").delete().eq("rundown_id", rundownId),
        supabase.from("weekend_rundown_vocal_feedback").delete().eq("rundown_id", rundownId),
      ]);

      const normalizedSongFeedback = payload.songFeedback
        .map((item) => ({
          rundown_id: rundownId,
          song_id: item.song_id,
          notes: item.notes.trim() || null,
        }))
        .filter((item) => item.notes);

      const normalizedVocalFeedback = payload.vocalFeedback
        .map((item) => ({
          rundown_id: rundownId,
          song_id: item.song_id,
          vocalist_id: item.vocalist_id,
          fit_label: item.fit_label === GOOD_FIT_LABEL ? GOOD_FIT_LABEL : null,
          notes: item.notes.trim() || null,
        }))
        .filter((item) => item.fit_label || item.notes);

      if (normalizedSongFeedback.length > 0) {
        const { error } = await supabase.from("weekend_rundown_song_feedback").insert(normalizedSongFeedback);
        if (error) throw error;
      }

      if (normalizedVocalFeedback.length > 0) {
        const { error } = await supabase.from("weekend_rundown_vocal_feedback").insert(normalizedVocalFeedback);
        if (error) throw error;
      }

      return rundown as WeekendRundownRow;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: ["weekend-rundown", userId, variables.campusId, variables.weekendDate],
      });
      queryClient.invalidateQueries({
        queryKey: ["weekend-rundown-entries", variables.campusId, variables.weekendDate],
      });
      queryClient.invalidateQueries({
        queryKey: ["weekend-rundown-good-fit-highlights", userId, variables.campusId],
      });
      toast({
        title: "Weekend Rundown saved",
        description: "Your post-weekend notes are ready for future planning.",
      });
    },
    onError: (error) => {
      toast({
        title: "Could not save Weekend Rundown",
        description: error.message,
        variant: "destructive",
      });
    },
  });
}

export function useWeekendRundownSetSongs(
  campus:
    | {
        id: string;
        has_saturday_service?: boolean | null;
        has_sunday_service?: boolean | null;
      }
    | null
    | undefined,
  weekendDate: Date | null,
  enabled: boolean,
) {
  return useQuery({
    queryKey: ["weekend-rundown-set-songs", campus?.id, weekendDate ? format(weekendDate, "yyyy-MM-dd") : null],
    queryFn: async () => {
      if (!campus?.id || !weekendDate || !enabled) return [];

      const weekendDateStr = format(weekendDate, "yyyy-MM-dd");
      const planDateStr = format(getWeekendPlanDate(weekendDate, campus), "yyyy-MM-dd");

      const { data: draftSets, error: draftSetsError } = await supabase
        .from("draft_sets")
        .select("id, plan_date, status, published_at, updated_at")
        .eq("campus_id", campus.id)
        .eq("ministry_type", "weekend")
        .in("plan_date", Array.from(new Set([weekendDateStr, planDateStr])));

      if (draftSetsError) throw draftSetsError;
      if (!draftSets || draftSets.length === 0) return [];

      const selectedDraftSet = [...draftSets].sort((a, b) => {
        const aPublished = a.status === "published" ? 1 : 0;
        const bPublished = b.status === "published" ? 1 : 0;
        if (aPublished !== bPublished) return bPublished - aPublished;
        return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
      })[0];

      const { data: songs, error: songsError } = await supabase
        .from("draft_set_songs")
        .select("id, song_id, sequence_order, vocalist_id, songs(id, title)")
        .eq("draft_set_id", selectedDraftSet.id)
        .order("sequence_order", { ascending: true });

      if (songsError) throw songsError;

      const songRows = (songs || []) as DraftSetSongRow[];

      const draftSetSongIds = songRows.map((song) => song.id);
      const { data: vocalistAssignments, error: vocalistAssignmentsError } = await supabase
        .from("draft_set_song_vocalists")
        .select("draft_set_song_id, vocalist_id")
        .in("draft_set_song_id", draftSetSongIds.length > 0 ? draftSetSongIds : ["00000000-0000-0000-0000-000000000000"]);

      if (vocalistAssignmentsError) throw vocalistAssignmentsError;

      const vocalistAssignmentsMap = new Map<string, string[]>();
      for (const assignment of vocalistAssignments || []) {
        const existingAssignments = vocalistAssignmentsMap.get(assignment.draft_set_song_id) || [];
        existingAssignments.push(assignment.vocalist_id);
        vocalistAssignmentsMap.set(assignment.draft_set_song_id, existingAssignments);
      }

      const vocalistIds = Array.from(
        new Set(
          songRows.flatMap((song) => {
            const linkedVocalistIds = vocalistAssignmentsMap.get(song.id) || [];
            return linkedVocalistIds.length > 0 ? linkedVocalistIds : (song.vocalist_id ? [song.vocalist_id] : []);
          }),
        ),
      );

      let vocalistMap = new Map<string, string>();
      if (vocalistIds.length > 0) {
        const { data: profiles, error: profilesError } = await supabase
          .from("profiles")
          .select("id, full_name")
          .in("id", vocalistIds);

        if (profilesError) throw profilesError;

        vocalistMap = new Map(
          (profiles || []).map((profile) => [profile.id, profile.full_name || "Unknown vocalist"]),
        );
      }

      return songRows.map((song) => {
        const linkedVocalistIds = vocalistAssignmentsMap.get(song.id) || [];
        const assignedVocalistIds = linkedVocalistIds.length > 0
          ? Array.from(new Set(linkedVocalistIds))
          : (song.vocalist_id ? [song.vocalist_id] : []);
        return {
          draft_set_song_id: song.id,
          song_id: song.song_id,
          title: song.songs?.title || "Untitled Song",
          sequence_order: song.sequence_order,
          vocalist_ids: assignedVocalistIds,
          vocalists: assignedVocalistIds.map((vocalistId) => ({
            id: vocalistId,
            name: vocalistMap.get(vocalistId) || "Unknown vocalist",
          })),
        };
      }) as WeekendRundownSetSong[];
    },
    enabled: !!campus?.id && !!weekendDate && enabled,
  });
}

export function useWeekendRundownGoodFitHighlights(
  userId: string | undefined,
  campusId: string | null,
  vocalists: Array<{ userId: string; name: string }>,
) {
  return useQuery({
    queryKey: [
      "weekend-rundown-good-fit-highlights",
      userId,
      campusId,
      vocalists.map((vocalist) => vocalist.userId).sort().join(","),
    ],
    queryFn: async () => {
      if (!userId || !campusId || vocalists.length === 0) return {} as Record<string, string[]>;

      const vocalistIds = vocalists.map((vocalist) => vocalist.userId);
      const vocalistNameMap = new Map(vocalists.map((vocalist) => [vocalist.userId, vocalist.name]));

      const { data: rundowns, error: rundownError } = await supabase
        .from("weekend_rundowns")
        .select("id")
        .eq("user_id", userId)
        .eq("campus_id", campusId);

      if (rundownError) throw rundownError;
      if (!rundowns || rundowns.length === 0) return {} as Record<string, string[]>;

      const rundownIds = rundowns.map((rundown) => rundown.id);
      const { data: feedback, error: feedbackError } = await supabase
        .from("weekend_rundown_vocal_feedback")
        .select("song_id, vocalist_id")
        .in("rundown_id", rundownIds)
        .eq("fit_label", GOOD_FIT_LABEL)
        .in("vocalist_id", vocalistIds);

      if (feedbackError) throw feedbackError;

      const result: Record<string, string[]> = {};
      for (const entry of feedback || []) {
        const current = result[entry.song_id] || [];
        const vocalistName = vocalistNameMap.get(entry.vocalist_id);
        if (vocalistName && !current.includes(vocalistName)) {
          current.push(vocalistName);
        }
        result[entry.song_id] = current;
      }

      return result;
    },
    enabled: !!userId && !!campusId && vocalists.length > 0,
  });
}
