import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { getWeekendPlanDate, GOOD_FIT_LABEL } from "@/lib/weekendRundown";
import { getCurrentResourceAppKey, isCurrentStudentResourceApp } from "@/lib/resourceApp";

type WeekendRundownStatus = "no_issues" | "minor_issues" | "no_distractions" | "dumpster_fire";

export interface WeekendRundownRow {
  id: string;
  campus_id: string;
  resource_app_key: string;
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
        .eq("resource_app_key", getCurrentResourceAppKey())
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
        .select("id, campus_id, resource_app_key, weekend_date, user_id, overall_status, notes, created_at, updated_at")
        .eq("campus_id", campusId)
        .eq("weekend_date", weekendDate)
        .eq("resource_app_key", getCurrentResourceAppKey())
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
      const resourceAppKey = getCurrentResourceAppKey();

      if (!userId) {
        throw new Error("You must be signed in to save a weekend rundown.");
      }

      const { data: rundown, error: rundownError } = await supabase
        .from("weekend_rundowns")
        .upsert(
          {
            user_id: userId,
            campus_id: payload.campusId,
            resource_app_key: resourceAppKey,
            weekend_date: payload.weekendDate,
            overall_status: payload.overallStatus,
            notes: payload.notes.trim() || null,
          },
          { onConflict: "user_id,campus_id,weekend_date,resource_app_key" },
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
      const rundownName = isCurrentStudentResourceApp() ? "Wednesday Rundown" : "Weekend Rundown";
      queryClient.invalidateQueries({
        queryKey: ["weekend-rundown", userId, variables.campusId, variables.weekendDate],
      });
      queryClient.invalidateQueries({
        queryKey: ["weekend-rundown-entries", variables.campusId, variables.weekendDate],
      });
      queryClient.invalidateQueries({
        queryKey: ["weekend-rundown-good-fit-highlights", userId, variables.campusId],
      });
      queryClient.invalidateQueries({
        queryKey: ["weekend-rundown-history", variables.campusId],
      });
      queryClient.invalidateQueries({
        queryKey: ["weekend-rundown-history-detail", variables.campusId, variables.weekendDate],
      });
      queryClient.invalidateQueries({
        queryKey: ["weekend-rundown-vocalist-notes", variables.campusId],
      });
      toast({
        title: `${rundownName} saved`,
        description: isCurrentStudentResourceApp()
          ? "Your post-Wednesday notes are ready for future planning."
          : "Your post-weekend notes are ready for future planning.",
      });
    },
    onError: (error) => {
      const rundownName = isCurrentStudentResourceApp() ? "Wednesday Rundown" : "Weekend Rundown";
      toast({
        title: `Could not save ${rundownName}`,
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
        .eq("campus_id", campusId)
        .eq("resource_app_key", getCurrentResourceAppKey());

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

export interface WeekendRundownHistorySummary {
  weekend_date: string;
  entry_count: number;
  latest_updated_at: string;
  statuses: WeekendRundownStatus[];
  author_names: string[];
}

export interface WeekendRundownHistoryDetailEntry extends WeekendRundownEntry {
  songFeedback: Array<WeekendRundownSongFeedbackRow & { song_title: string }>;
  vocalFeedback: Array<
    WeekendRundownVocalFeedbackRow & {
      song_title: string;
      vocalist_name: string;
    }
  >;
}

export interface VocalistRundownNote {
  id: string;
  vocalist_id: string;
  vocalist_name: string;
  song_id: string;
  song_title: string;
  notes: string;
  fit_label: string | null;
  weekend_date: string;
  author_id: string;
  author_name: string | null;
  updated_at: string;
}

export function useWeekendRundownHistory(campusId: string | null) {
  return useQuery({
    queryKey: ["weekend-rundown-history", campusId, getCurrentResourceAppKey()],
    queryFn: async () => {
      if (!campusId) return [] as WeekendRundownHistorySummary[];

      const { data: rundowns, error } = await supabase
        .from("weekend_rundowns")
        .select("id, weekend_date, overall_status, user_id, updated_at")
        .eq("campus_id", campusId)
        .eq("resource_app_key", getCurrentResourceAppKey())
        .order("weekend_date", { ascending: false });

      if (error) throw error;
      if (!rundowns || rundowns.length === 0) return [] as WeekendRundownHistorySummary[];

      const userIds = Array.from(new Set(rundowns.map((entry) => entry.user_id)));
      const { data: profiles, error: profilesError } = await supabase
        .from("profiles")
        .select("id, full_name")
        .in("id", userIds);

      if (profilesError) throw profilesError;

      const profileMap = new Map((profiles || []).map((profile) => [profile.id, profile.full_name || "Unknown leader"]));
      const byDate = new Map<string, WeekendRundownHistorySummary>();

      for (const entry of rundowns) {
        const existing = byDate.get(entry.weekend_date);
        const authorName = profileMap.get(entry.user_id) || "Unknown leader";
        if (!existing) {
          byDate.set(entry.weekend_date, {
            weekend_date: entry.weekend_date,
            entry_count: 1,
            latest_updated_at: entry.updated_at,
            statuses: [entry.overall_status as WeekendRundownStatus],
            author_names: [authorName],
          });
          continue;
        }

        existing.entry_count += 1;
        if (new Date(entry.updated_at).getTime() > new Date(existing.latest_updated_at).getTime()) {
          existing.latest_updated_at = entry.updated_at;
        }
        if (!existing.statuses.includes(entry.overall_status as WeekendRundownStatus)) {
          existing.statuses.push(entry.overall_status as WeekendRundownStatus);
        }
        if (!existing.author_names.includes(authorName)) {
          existing.author_names.push(authorName);
        }
      }

      return Array.from(byDate.values()).sort((a, b) => b.weekend_date.localeCompare(a.weekend_date));
    },
    enabled: !!campusId,
  });
}

export function useWeekendRundownHistoryDetail(campusId: string | null, weekendDate: string | null) {
  return useQuery({
    queryKey: ["weekend-rundown-history-detail", campusId, weekendDate, getCurrentResourceAppKey()],
    queryFn: async () => {
      if (!campusId || !weekendDate) return [] as WeekendRundownHistoryDetailEntry[];

      const { data: rundowns, error } = await supabase
        .from("weekend_rundowns")
        .select("id, campus_id, resource_app_key, weekend_date, user_id, overall_status, notes, created_at, updated_at")
        .eq("campus_id", campusId)
        .eq("weekend_date", weekendDate)
        .eq("resource_app_key", getCurrentResourceAppKey())
        .order("updated_at", { ascending: false });

      if (error) throw error;
      if (!rundowns || rundowns.length === 0) return [] as WeekendRundownHistoryDetailEntry[];

      const rundownIds = rundowns.map((entry) => entry.id);
      const userIds = Array.from(new Set(rundowns.map((entry) => entry.user_id)));

      const [
        { data: profiles, error: profilesError },
        { data: songFeedback, error: songError },
        { data: vocalFeedback, error: vocalError },
      ] = await Promise.all([
        supabase.from("profiles").select("id, full_name, avatar_url").in("id", userIds),
        supabase.from("weekend_rundown_song_feedback").select("*").in("rundown_id", rundownIds),
        supabase.from("weekend_rundown_vocal_feedback").select("*").in("rundown_id", rundownIds),
      ]);

      if (profilesError) throw profilesError;
      if (songError) throw songError;
      if (vocalError) throw vocalError;

      const songIds = Array.from(
        new Set([
          ...(songFeedback || []).map((item) => item.song_id),
          ...(vocalFeedback || []).map((item) => item.song_id),
        ]),
      );
      const vocalistIds = Array.from(new Set((vocalFeedback || []).map((item) => item.vocalist_id)));

      const [{ data: songs, error: songsError }, { data: vocalistProfiles, error: vocalistProfilesError }] =
        await Promise.all([
          songIds.length > 0
            ? supabase.from("songs").select("id, title").in("id", songIds)
            : Promise.resolve({ data: [], error: null }),
          vocalistIds.length > 0
            ? supabase.from("profiles").select("id, full_name").in("id", vocalistIds)
            : Promise.resolve({ data: [], error: null }),
        ]);

      if (songsError) throw songsError;
      if (vocalistProfilesError) throw vocalistProfilesError;

      const profileMap = new Map((profiles || []).map((profile) => [profile.id, profile]));
      const songTitleMap = new Map((songs || []).map((song) => [song.id, song.title || "Untitled Song"]));
      const vocalistNameMap = new Map(
        (vocalistProfiles || []).map((profile) => [profile.id, profile.full_name || "Unknown vocalist"]),
      );

      const songFeedbackByRundown = new Map<string, typeof songFeedback>();
      for (const item of songFeedback || []) {
        const existing = songFeedbackByRundown.get(item.rundown_id) || [];
        existing.push(item);
        songFeedbackByRundown.set(item.rundown_id, existing);
      }

      const vocalFeedbackByRundown = new Map<string, typeof vocalFeedback>();
      for (const item of vocalFeedback || []) {
        const existing = vocalFeedbackByRundown.get(item.rundown_id) || [];
        existing.push(item);
        vocalFeedbackByRundown.set(item.rundown_id, existing);
      }

      return rundowns.map((entry) => {
        const profile = profileMap.get(entry.user_id);
        return {
          ...(entry as WeekendRundownRow),
          profile_name: profile?.full_name || null,
          profile_avatar_url: profile?.avatar_url || null,
          songFeedback: (songFeedbackByRundown.get(entry.id) || []).map((item) => ({
            ...(item as WeekendRundownSongFeedbackRow),
            song_title: songTitleMap.get(item.song_id) || "Untitled Song",
          })),
          vocalFeedback: (vocalFeedbackByRundown.get(entry.id) || []).map((item) => ({
            ...(item as WeekendRundownVocalFeedbackRow),
            song_title: songTitleMap.get(item.song_id) || "Untitled Song",
            vocalist_name: vocalistNameMap.get(item.vocalist_id) || "Unknown vocalist",
          })),
        } as WeekendRundownHistoryDetailEntry;
      });
    },
    enabled: !!campusId && !!weekendDate,
  });
}

export function useScheduledVocalistRundownNotes(
  campusId: string | null,
  vocalists: Array<{ userId: string; name: string }>,
) {
  return useQuery({
    queryKey: [
      "weekend-rundown-vocalist-notes",
      campusId,
      getCurrentResourceAppKey(),
      vocalists.map((vocalist) => vocalist.userId).sort().join(","),
    ],
    queryFn: async () => {
      if (!campusId || vocalists.length === 0) return [] as VocalistRundownNote[];

      const vocalistIds = vocalists.map((vocalist) => vocalist.userId);
      const vocalistNameMap = new Map(vocalists.map((vocalist) => [vocalist.userId, vocalist.name]));

      const { data: rundowns, error: rundownError } = await supabase
        .from("weekend_rundowns")
        .select("id, weekend_date, user_id, updated_at")
        .eq("campus_id", campusId)
        .eq("resource_app_key", getCurrentResourceAppKey());

      if (rundownError) throw rundownError;
      if (!rundowns || rundowns.length === 0) return [] as VocalistRundownNote[];

      const rundownMap = new Map(rundowns.map((rundown) => [rundown.id, rundown]));
      const rundownIds = rundowns.map((rundown) => rundown.id);

      const { data: feedback, error: feedbackError } = await supabase
        .from("weekend_rundown_vocal_feedback")
        .select("id, rundown_id, song_id, vocalist_id, fit_label, notes, updated_at")
        .in("rundown_id", rundownIds)
        .in("vocalist_id", vocalistIds)
        .not("notes", "is", null);

      if (feedbackError) throw feedbackError;

      const notesFeedback = (feedback || []).filter((item) => item.notes?.trim());
      if (notesFeedback.length === 0) return [] as VocalistRundownNote[];

      const songIds = Array.from(new Set(notesFeedback.map((item) => item.song_id)));
      const authorIds = Array.from(
        new Set(
          notesFeedback
            .map((item) => rundownMap.get(item.rundown_id)?.user_id)
            .filter(Boolean) as string[],
        ),
      );

      const [{ data: songs, error: songsError }, { data: authors, error: authorsError }] = await Promise.all([
        supabase.from("songs").select("id, title").in("id", songIds),
        supabase.from("profiles").select("id, full_name").in("id", authorIds),
      ]);

      if (songsError) throw songsError;
      if (authorsError) throw authorsError;

      const songTitleMap = new Map((songs || []).map((song) => [song.id, song.title || "Untitled Song"]));
      const authorNameMap = new Map((authors || []).map((profile) => [profile.id, profile.full_name || "Unknown leader"]));

      return notesFeedback
        .map((item) => {
          const rundown = rundownMap.get(item.rundown_id);
          if (!rundown) return null;
          return {
            id: item.id,
            vocalist_id: item.vocalist_id,
            vocalist_name: vocalistNameMap.get(item.vocalist_id) || "Unknown vocalist",
            song_id: item.song_id,
            song_title: songTitleMap.get(item.song_id) || "Untitled Song",
            notes: item.notes!.trim(),
            fit_label: item.fit_label,
            weekend_date: rundown.weekend_date,
            author_id: rundown.user_id,
            author_name: authorNameMap.get(rundown.user_id) || null,
            updated_at: item.updated_at,
          } as VocalistRundownNote;
        })
        .filter(Boolean)
        .sort((a, b) => {
          const dateCompare = b!.weekend_date.localeCompare(a!.weekend_date);
          if (dateCompare !== 0) return dateCompare;
          return new Date(b!.updated_at).getTime() - new Date(a!.updated_at).getTime();
        }) as VocalistRundownNote[];
    },
    enabled: !!campusId && vocalists.length > 0,
  });
}
