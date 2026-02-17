import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import { useToast } from "./use-toast";
import { getPriorUseCountsForSongs } from "./useSongs";
import { getWeekendPairDate, isWeekend } from "@/lib/utils";

export interface SetlistConfirmation {
  id: string;
  draft_set_id: string;
  user_id: string;
  confirmed_at: string;
  created_at: string;
}

export interface PublishedSetlist {
  id: string;
  campus_id: string;
  plan_date: string;
  ministry_type: string;
  custom_service_id: string | null;
  notes: string | null;
  published_at: string;
  campuses: { name: string } | null;
  songs: {
    id: string;
    song_id: string;
    sequence_order: number;
    song_key: string | null;
    vocalist: { id: string; full_name: string | null; avatar_url: string | null } | null;
    song: { title: string; author: string | null } | null;
    isFirstUse?: boolean;
  }[];
  myConfirmation: SetlistConfirmation | null;
  /** True if the current user is on the team roster for this setlist's date/campus/ministry (can confirm). */
  amIOnRoster?: boolean;
}

const WEEKEND_MINISTRY_ALIASES = new Set(["weekend", "sunday_am", "weekend_team"]);
const WEEKEND_SUPPORTING_MINISTRIES = new Set(["production", "video"]);

function ministriesMatch(memberMinistry: string, setMinistry: string): boolean {
  if (!memberMinistry || !setMinistry) return false;
  if (memberMinistry === setMinistry) return true;
  if (WEEKEND_MINISTRY_ALIASES.has(memberMinistry) && WEEKEND_MINISTRY_ALIASES.has(setMinistry)) {
    return true;
  }
  return false;
}

function shouldIncludeScheduledDateForMember(
  memberMinistries: string[],
  scheduleMinistryType: string | null,
): boolean {
  // No explicit ministry restrictions on the member record means include by default.
  if (memberMinistries.length === 0) return true;
  if (!scheduleMinistryType) return true;

  // Standard direct/alias match.
  if (memberMinistries.some((memberMinistry) => ministriesMatch(memberMinistry, scheduleMinistryType))) {
    return true;
  }

  // Weekend services always involve Production + Video teams.
  // If a weekend schedule exists, include members tagged for production/video.
  if (WEEKEND_MINISTRY_ALIASES.has(scheduleMinistryType)) {
    return memberMinistries.some((memberMinistry) => WEEKEND_SUPPORTING_MINISTRIES.has(memberMinistry));
  }

  return false;
}

// Fetch published setlists for the current user's campuses
export function usePublishedSetlists(campusId?: string, ministryType?: string, includePast: boolean = false) {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["published-setlists", user?.id, campusId, ministryType, includePast],
    queryFn: async (): Promise<PublishedSetlist[]> => {
      if (!user?.id) return [];

      // Check user's role to determine if they're a volunteer
      const { data: userRoles } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id);

      const roles = (userRoles || []).map(r => r.role);
      const leadershipRoles = [
        "admin", "campus_admin", "campus_worship_pastor", "student_worship_pastor",
        "network_worship_pastor", "network_worship_leader", "leader",
        "video_director", "production_manager", "campus_pastor"
      ];
      const hasLeadershipRole = roles.some(r => leadershipRoles.includes(r));
      const isVolunteerOnly = (roles.includes("volunteer") || roles.includes("member")) && !hasLeadershipRole;

      // Get user's campuses
      const { data: userCampuses } = await supabase
        .from("user_campuses")
        .select("campus_id")
        .eq("user_id", user.id);

      const userCampusIds = campusId 
        ? [campusId] 
        : (userCampuses || []).map(uc => uc.campus_id);

      // Also get dates where the user has swapped IN
      // User swaps in on original_date when they're the accepted_by
      const { data: swapsAsAcceptor } = await supabase
        .from("swap_requests")
        .select("original_date")
        .eq("accepted_by_id", user.id)
        .eq("status", "accepted");

      // User swaps in on swap_date when they're the requester
      const { data: swapsAsRequester } = await supabase
        .from("swap_requests")
        .select("swap_date")
        .eq("requester_id", user.id)
        .eq("status", "accepted")
        .not("swap_date", "is", null);

      const rawSwapDates = [
        ...(swapsAsAcceptor || []).map(s => s.original_date),
        ...(swapsAsRequester || []).map(s => s.swap_date),
      ].filter(Boolean) as string[];
      const swapDatesSet = new Set<string>(rawSwapDates);
      for (const date of rawSwapDates) {
        if (!isWeekend(date)) continue;
        const pair = getWeekendPairDate(date);
        if (pair) swapDatesSet.add(pair);
      }
      const swapDates = Array.from(swapDatesSet);

      // For volunteers, get their scheduled dates based on team assignments
      let scheduledDates: Set<string> | null = null;
      if (isVolunteerOnly) {
        // Get teams the user is a member of
        const { data: teamMemberships } = await supabase
          .from("team_members")
          .select("team_id, ministry_types, rotation_period_id")
          .eq("user_id", user.id);

        const teamIds = [...new Set((teamMemberships || []).map(m => m.team_id))];

        if (teamIds.length > 0) {
          // Get scheduled dates for those teams
          let schedulesQuery = supabase
            .from("team_schedule")
            .select("schedule_date, team_id, ministry_type")
            .in("team_id", teamIds);
          
          if (!includePast) {
            schedulesQuery = schedulesQuery.gte("schedule_date", new Date().toISOString().split("T")[0]);
          }
          
          const { data: schedules } = await schedulesQuery;

          scheduledDates = new Set<string>();
          
          for (const schedule of schedules || []) {
            const membership = (teamMemberships || []).find(m => m.team_id === schedule.team_id);
            const userMinistryTypes = membership?.ministry_types || [];
            
            // If no ministry types set, include all dates
            // Otherwise, only include if ministry type matches
            if (shouldIncludeScheduledDateForMember(userMinistryTypes, schedule.ministry_type)) {
              scheduledDates.add(schedule.schedule_date);
            }
          }

          // Also include swap dates
          for (const date of swapDates) {
            scheduledDates.add(date);
          }
        } else {
          // No team memberships - only show swap dates
          scheduledDates = new Set(swapDates);
        }
      }

      // Fetch published setlists for user's campuses
      let setlistsFromCampuses: any[] = [];
      if (userCampusIds.length > 0) {
        let query = supabase
          .from("draft_sets")
          .select(`
            id,
            campus_id,
            plan_date,
            ministry_type,
            custom_service_id,
            notes,
            published_at,
            campuses(name)
          `)
          .eq("status", "published")
          .not("published_at", "is", null)
          .in("campus_id", userCampusIds)
          .order("plan_date", { ascending: includePast ? false : true });
        
        if (!includePast) {
          query = query.gte("plan_date", new Date().toISOString().split("T")[0]);
        }

        if (ministryType) {
          query = query.eq("ministry_type", ministryType);
        }

        const { data } = await query;
        setlistsFromCampuses = data || [];
      }

      // Fetch setlists for swap dates (even if outside user's campuses)
      let setlistsFromSwaps: any[] = [];
      if (swapDates.length > 0) {
        let query = supabase
          .from("draft_sets")
          .select(`
            id,
            campus_id,
            plan_date,
            ministry_type,
            custom_service_id,
            notes,
            published_at,
            campuses(name)
          `)
          .eq("status", "published")
          .not("published_at", "is", null)
          .in("plan_date", swapDates);
        
        if (!includePast) {
          query = query.gte("plan_date", new Date().toISOString().split("T")[0]);
        }

        if (ministryType) {
          query = query.eq("ministry_type", ministryType);
        }

        const { data } = await query;
        setlistsFromSwaps = data || [];
      }

      // Merge and deduplicate
      const seenIds = new Set<string>();
      let setlists = [...setlistsFromCampuses, ...setlistsFromSwaps]
        .filter(s => {
          if (seenIds.has(s.id)) return false;
          seenIds.add(s.id);
          return true;
        })
        .sort((a, b) => a.plan_date.localeCompare(b.plan_date));

      // For volunteers, filter to only scheduled dates
      if (isVolunteerOnly && scheduledDates) {
        setlists = setlists.filter(s => scheduledDates!.has(s.plan_date));
      }

      if (setlists.length === 0) return [];

      // Backfill legacy published rows missing custom_service_id by inferring from
      // a unique active custom service on the same date/campus/ministry.
      const unresolved = setlists.filter((s) => !s.custom_service_id);
      if (unresolved.length > 0) {
        const dates = [...new Set(unresolved.map((s) => s.plan_date))];
        const campusIds = [...new Set(unresolved.map((s) => s.campus_id))];
        const ministryTypes = [...new Set(unresolved.map((s) => s.ministry_type))];

        const { data: customServices } = await supabase
          .from("custom_services")
          .select("id, service_date, campus_id, ministry_type, is_active")
          .eq("is_active", true)
          .in("service_date", dates)
          .in("campus_id", campusIds)
          .in("ministry_type", ministryTypes);

        const customByKey = new Map<string, string[]>();
        for (const service of customServices || []) {
          const key = `${service.service_date}|${service.campus_id}|${service.ministry_type}`;
          const existing = customByKey.get(key) || [];
          existing.push(service.id);
          customByKey.set(key, existing);
        }

        setlists = setlists.map((setlist) => {
          if (setlist.custom_service_id) return setlist;
          const key = `${setlist.plan_date}|${setlist.campus_id}|${setlist.ministry_type}`;
          const matches = customByKey.get(key) || [];
          if (matches.length === 1) {
            return { ...setlist, custom_service_id: matches[0] };
          }
          return setlist;
        });
      }

      // Resolve confirm-button eligibility from a single DB source of truth
      // so only rostered users (including accepted swaps) can confirm.
      const rosterEligibilityBySetId = new Map<string, boolean>();
      const customServiceSetlists = setlists.filter((s) => !!s.custom_service_id);
      const customServiceAssignmentKeys = new Set<string>();

      if (customServiceSetlists.length > 0) {
        const customServiceIds = [
          ...new Set(customServiceSetlists.map((s) => s.custom_service_id!).filter(Boolean)),
        ];
        const customServiceDates = [...new Set(customServiceSetlists.map((s) => s.plan_date))];
        const { data: myCustomAssignments } = await supabase
          .from("custom_service_assignments")
          .select("custom_service_id, assignment_date")
          .eq("user_id", user.id)
          .in("custom_service_id", customServiceIds)
          .in("assignment_date", customServiceDates);

        for (const assignment of myCustomAssignments || []) {
          customServiceAssignmentKeys.add(`${assignment.custom_service_id}|${assignment.assignment_date}`);
        }
      }

      await Promise.all(
        (setlists || []).map(async (setlist) => {
          if (setlist.custom_service_id) {
            const isAssigned = customServiceAssignmentKeys.has(
              `${setlist.custom_service_id}|${setlist.plan_date}`
            );
            rosterEligibilityBySetId.set(setlist.id, isAssigned);
            return;
          }

          const { data, error } = await supabase.rpc("is_user_on_setlist_roster", {
            p_draft_set_id: setlist.id,
            p_user_id: user.id,
          });

          if (error) {
            console.error("Error checking roster eligibility:", error);
            rosterEligibilityBySetId.set(setlist.id, false);
            return;
          }

          rosterEligibilityBySetId.set(setlist.id, Boolean(data));
        }),
      );

      // Fetch songs for each setlist
      const setlistIds = (setlists || []).map(s => s.id);
      
      const { data: allSongs } = await supabase
        .from("draft_set_songs")
        .select(`
          id,
          draft_set_id,
          song_id,
          sequence_order,
          song_key,
          vocalist_id,
          songs(title, author)
        `)
        .in("draft_set_id", setlistIds.length > 0 ? setlistIds : ["00000000-0000-0000-0000-000000000000"])
        .order("sequence_order");

      // Fetch multi-vocalist assignments from junction table
      const draftSetSongIds = (allSongs || []).map(s => s.id);
      const { data: vocalistAssignments } = await supabase
        .from("draft_set_song_vocalists")
        .select("draft_set_song_id, vocalist_id")
        .in("draft_set_song_id", draftSetSongIds.length > 0 ? draftSetSongIds : ["00000000-0000-0000-0000-000000000000"]);

      // Build vocalist map per draft_set_song
      const songVocalistMap = new Map<string, string[]>();
      for (const v of vocalistAssignments || []) {
        const existing = songVocalistMap.get(v.draft_set_song_id) || [];
        existing.push(v.vocalist_id);
        songVocalistMap.set(v.draft_set_song_id, existing);
      }

      // Get all unique vocalist IDs (from junction table, falling back to legacy field)
      const allVocalistIds = new Set<string>();
      for (const song of allSongs || []) {
        const junctionVocalists = songVocalistMap.get(song.id) || [];
        if (junctionVocalists.length > 0) {
          junctionVocalists.forEach(id => allVocalistIds.add(id));
        } else if (song.vocalist_id) {
          allVocalistIds.add(song.vocalist_id);
        }
      }
      
      // Fetch vocalist profiles using the get_basic_profiles function (SECURITY DEFINER)
      // This bypasses complex RLS rules and allows volunteers to see assigned vocalist info
      const { data: allBasicProfiles } = await supabase.rpc("get_basic_profiles");
      
      // Filter to only the vocalists we need
      const vocalistProfiles = (allBasicProfiles || []).filter(p => allVocalistIds.has(p.id));
      
      const vocalistMap = new Map((vocalistProfiles || []).map(p => [p.id, p]));

      // Fetch user's confirmations
      const { data: confirmations } = await supabase
        .from("setlist_confirmations")
        .select("*")
        .eq("user_id", user.id)
        .in("draft_set_id", setlistIds.length > 0 ? setlistIds : ["00000000-0000-0000-0000-000000000000"]);

      // Prior use counts per setlist (for NEW badge)
      const setlistSongsWithPrior = await Promise.all(
        (setlists || []).map(async (setlist) => {
          const setlistSongItems = (allSongs || []).filter(s => s.draft_set_id === setlist.id);
          const songIdsWithTitles = setlistSongItems.map(s => ({
            id: s.song_id,
            title: (s.songs as { title?: string } | null)?.title ?? "",
          }));
          const priorCounts = await getPriorUseCountsForSongs(
            songIdsWithTitles,
            setlist.plan_date,
            setlist.campus_id ? [setlist.campus_id] : null,
            setlist.ministry_type ? [setlist.ministry_type] : null
          );
          return { setlist, setlistSongItems, priorCounts };
        })
      );

      // Map songs and confirmations to setlists
      return (setlists || []).map(setlist => {
        const { setlistSongItems, priorCounts } = setlistSongsWithPrior.find(p => p.setlist.id === setlist.id) ?? { setlistSongItems: [], priorCounts: new Map<string, number>() };
        const amIOnRoster = rosterEligibilityBySetId.get(setlist.id) ?? false;
        return {
          ...setlist,
          songs: setlistSongItems.map(s => {
            const junctionVocalistIds = songVocalistMap.get(s.id) || [];
            const primaryVocalistId = junctionVocalistIds.length > 0 ? junctionVocalistIds[0] : s.vocalist_id;
            return {
              id: s.id,
              song_id: s.song_id,
              sequence_order: s.sequence_order,
              song_key: s.song_key || null,
              vocalist: primaryVocalistId ? vocalistMap.get(primaryVocalistId) || null : null,
              song: s.songs as { title: string; author: string | null } | null,
              isFirstUse: (priorCounts.get(s.song_id) ?? 0) === 0,
            };
          }),
          myConfirmation: (confirmations || []).find(c => c.draft_set_id === setlist.id) || null,
          amIOnRoster,
        };
      });
    },
    enabled: !!user?.id,
  });
}

// Fetch confirmation status for a specific setlist (admin view)
export function useSetlistConfirmationStatus(draftSetId: string | null) {
  return useQuery({
    queryKey: ["setlist-confirmation-status", draftSetId],
    queryFn: async () => {
      if (!draftSetId) return { confirmations: [], totalScheduled: 0 };

      // Get the draft set details
      const { data: draftSet, error: draftSetError } = await supabase
        .from("draft_sets")
        .select("campus_id, plan_date, ministry_type")
        .eq("id", draftSetId)
        .single();

      if (draftSetError || !draftSet) {
        throw new Error("Draft set not found");
      }

      // Get team scheduled for this date
      const { data: teamSchedule } = await supabase
        .from("team_schedule")
        .select("team_id")
        .eq("schedule_date", draftSet.plan_date)
        .limit(1)
        .maybeSingle();

      // Get rotation periods for this campus and date
      const { data: rotationPeriods } = await supabase
        .from("rotation_periods")
        .select("id")
        .eq("campus_id", draftSet.campus_id)
        .lte("start_date", draftSet.plan_date)
        .gte("end_date", draftSet.plan_date);

      const rotationPeriodIds = (rotationPeriods || []).map(rp => rp.id);

      // For a swap:
      // - original_date: requester is OUT, accepted_by is IN
      // - swap_date: accepted_by is OUT, requester is IN
      //
      // Cross-team rule: apply a swap to the scheduled roster for THIS date only
      // if one of the swap participants is on the scheduled roster for THIS date.

      // Fetch team members for this scheduled team (used for roster + to decide
      // whether a swap applies to THIS scheduled team)
      const { data: members } = teamSchedule?.team_id && rotationPeriodIds.length > 0
        ? await supabase
            .from("team_members")
            .select("user_id, member_name, ministry_types")
            .eq("team_id", teamSchedule.team_id)
            .in("rotation_period_id", rotationPeriodIds)
            .not("user_id", "is", null)
        : { data: [] as any[] };

      const rawTeamUserIds = new Set((members || []).map(m => m.user_id).filter(Boolean));

      // Get swaps where original_date matches (requester out, accepted_by in)
      const { data: swapsOnOriginalDate } = await supabase
        .from("swap_requests")
        .select(`
          requester_id,
          accepted_by_id,
          requester:profiles!swap_requests_requester_id_fkey(id, full_name),
          accepted_by:profiles!swap_requests_accepted_by_id_fkey(id, full_name)
        `)
        .eq("original_date", draftSet.plan_date)
        .eq("status", "accepted");

      // Get swaps where swap_date matches (accepted_by out, requester in)
      const { data: swapsOnSwapDate } = await supabase
        .from("swap_requests")
        .select(`
          requester_id,
          accepted_by_id,
          requester:profiles!swap_requests_requester_id_fkey(id, full_name),
          accepted_by:profiles!swap_requests_accepted_by_id_fkey(id, full_name)
        `)
        .eq("swap_date", draftSet.plan_date)
        .eq("status", "accepted")
        .not("swap_date", "is", null);

      // Build sets for who's out and who's in FOR THIS TEAM on THIS DATE
      const swappedOutUserIds = new Set<string>();
      const swappedInMembers: { user_id: string; member_name: string }[] = [];

      // On original_date: requester is out, accepted_by is in (apply only if requester is on this team's roster)
      for (const swap of swapsOnOriginalDate || []) {
        if (swap.requester_id && rawTeamUserIds.has(swap.requester_id)) {
          swappedOutUserIds.add(swap.requester_id);
          if (swap.accepted_by_id) {
            swappedInMembers.push({
              user_id: swap.accepted_by_id,
              member_name: (swap.accepted_by as any)?.full_name || "Unknown",
            });
          }
        }
      }

      // On swap_date: accepted_by is out, requester is in (apply only if accepted_by is on this team's roster)
      for (const swap of swapsOnSwapDate || []) {
        if (swap.accepted_by_id && rawTeamUserIds.has(swap.accepted_by_id)) {
          swappedOutUserIds.add(swap.accepted_by_id);
          if (swap.requester_id) {
            swappedInMembers.push({
              user_id: swap.requester_id,
              member_name: (swap.requester as any)?.full_name || "Unknown",
            });
          }
        }
      }

      // Dedupe and filter swapped-in members
      const seenSwappedIn = new Set<string>();
      const uniqueSwappedInMembers = swappedInMembers
        .filter(m => !swappedOutUserIds.has(m.user_id))
        .filter(m => {
          if (seenSwappedIn.has(m.user_id)) return false;
          seenSwappedIn.add(m.user_id);
          return true;
        });
      const swappedInUserIds = new Set(uniqueSwappedInMembers.map(m => m.user_id));

      // Get scheduled team members
      let scheduledMembers: { user_id: string; member_name: string; isSwappedIn: boolean }[] = [];

      // Deduplicate by user_id (a person can have multiple positions like vocalist + instrument)
      const seenUserIds = new Set<string>();
      scheduledMembers = (members || [])
        .filter(m => {
          if (!m.ministry_types || m.ministry_types.length === 0) return true;
          return m.ministry_types.includes(draftSet.ministry_type);
        })
        .filter(m => !swappedOutUserIds.has(m.user_id!))
        // Deduplicate by user_id
        .filter(m => {
          if (seenUserIds.has(m.user_id!)) return false;
          seenUserIds.add(m.user_id!);
          return true;
        })
        .map(m => ({ user_id: m.user_id!, member_name: m.member_name, isSwappedIn: false }));

      // Add members who swapped in
      const existingUserIds = new Set(scheduledMembers.map(m => m.user_id));
      for (const swappedIn of uniqueSwappedInMembers) {
        if (!existingUserIds.has(swappedIn.user_id)) {
          scheduledMembers.push({
            user_id: swappedIn.user_id,
            member_name: swappedIn.member_name,
            isSwappedIn: true,
          });
        }
      }

      // Get confirmations for this setlist
      const { data: confirmations } = await supabase
        .from("setlist_confirmations")
        .select(`
          id,
          user_id,
          confirmed_at
        `)
        .eq("draft_set_id", draftSetId);

      // Get profile info for confirmed users
      const confirmedUserIds = (confirmations || []).map(c => c.user_id);
      
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, full_name, avatar_url")
        .in("id", confirmedUserIds.length > 0 ? confirmedUserIds : ["00000000-0000-0000-0000-000000000000"]);

      const profileMap = new Map((profiles || []).map(p => [p.id, p]));

      // Build detailed confirmation list
      const confirmedList = (confirmations || []).map(c => {
        const profile = profileMap.get(c.user_id);
        const member = scheduledMembers.find(m => m.user_id === c.user_id);
        return {
          userId: c.user_id,
          name: profile?.full_name || member?.member_name || "Unknown",
          avatarUrl: profile?.avatar_url || null,
          confirmedAt: c.confirmed_at,
          isSwappedIn: swappedInUserIds.has(c.user_id),
        };
      });

      // Build unconfirmed list
      const confirmedUserIdSet = new Set(confirmedUserIds);
      const unconfirmedList = scheduledMembers
        .filter(m => !confirmedUserIdSet.has(m.user_id))
        .map(m => ({
          userId: m.user_id,
          name: m.member_name,
          avatarUrl: null as string | null,
          isSwappedIn: m.isSwappedIn,
        }));

      // Get avatar URLs for unconfirmed members
      if (unconfirmedList.length > 0) {
        const { data: unconfirmedProfiles } = await supabase
          .from("profiles")
          .select("id, avatar_url")
          .in("id", unconfirmedList.map(u => u.userId));

        for (const profile of unconfirmedProfiles || []) {
          const member = unconfirmedList.find(u => u.userId === profile.id);
          if (member) {
            member.avatarUrl = profile.avatar_url;
          }
        }
      }

      return {
        confirmed: confirmedList,
        unconfirmed: unconfirmedList,
        totalScheduled: scheduledMembers.length,
      };
    },
    enabled: !!draftSetId,
  });
}

// Confirm a setlist
export function useConfirmSetlist() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (draftSetId: string) => {
      if (!user?.id) throw new Error("Not authenticated");

      const { error } = await supabase
        .from("setlist_confirmations")
        .insert({
          draft_set_id: draftSetId,
          user_id: user.id,
        });

      if (error) throw error;

      // Notify the worship leader that someone confirmed
      try {
        await supabase.functions.invoke("notify-setlist-confirmed", {
          body: { draftSetId, confirmerId: user.id },
        });
      } catch (notifyError) {
        console.error("Failed to send confirmation notification:", notifyError);
        // Don't throw - confirmation was successful even if notification fails
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["published-setlists"] });
      queryClient.invalidateQueries({ queryKey: ["setlist-confirmation-status"] });
      toast({
        title: "Setlist confirmed",
        description: "You've confirmed that you've reviewed this setlist.",
      });
    },
    onError: (error: Error) => {
      const message =
        /policy|row-level security|violates/.test(error.message)
          ? "You can only confirm setlists you're scheduled for."
          : error.message;
      toast({
        title: "Error confirming setlist",
        description: message,
        variant: "destructive",
      });
    },
  });
}

// Publish a setlist and notify team
export function usePublishSetlist() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (draftSetId: string) => {
      // First, get the details of this set to find replaceable draft duplicates
      const { data: thisSet, error: fetchError } = await supabase
        .from("draft_sets")
        .select("campus_id, ministry_type, plan_date, custom_service_id")
        .eq("id", draftSetId)
        .single();

      if (fetchError) throw fetchError;

      // Only clean up other in-progress drafts in the same service context.
      // Never auto-delete already published/approved sets.
      let duplicateQuery = supabase
        .from("draft_sets")
        .select("id")
        .eq("campus_id", thisSet.campus_id)
        .eq("ministry_type", thisSet.ministry_type)
        .eq("plan_date", thisSet.plan_date)
        .in("status", ["draft", "pending_approval"])
        .neq("id", draftSetId);

      if (thisSet.custom_service_id) {
        duplicateQuery = duplicateQuery.eq("custom_service_id", thisSet.custom_service_id);
      } else {
        duplicateQuery = duplicateQuery.is("custom_service_id", null);
      }

      const { data: duplicateSets } = await duplicateQuery;

      const deletedCount = duplicateSets?.length || 0;

      if (deletedCount > 0) {
        const idsToDelete = duplicateSets.map(s => s.id);
        
        // Delete the duplicate sets (cascade will handle draft_set_songs)
        const { error: deleteError } = await supabase
          .from("draft_sets")
          .delete()
          .in("id", idsToDelete);

        if (deleteError) {
          console.error("Error deleting duplicate sets:", deleteError);
          // Continue anyway - not critical
        }
      }

      // Update the draft set to published status
      const { error: updateError } = await supabase
        .from("draft_sets")
        .update({
          status: "published",
          published_at: new Date().toISOString(),
        })
        .eq("id", draftSetId);

      if (updateError) throw updateError;

      // Call the notify edge function
      const { data: { session } } = await supabase.auth.getSession();
      
      const response = await supabase.functions.invoke("notify-setlist-published", {
        body: { draftSetId },
      });

      if (response.error) {
        console.error("Notification error:", response.error);
        // Don't throw - the setlist is still published even if notification fails
      }

      return { ...response.data, deletedCount };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["draft-sets"] });
      queryClient.invalidateQueries({ queryKey: ["published-setlists"] });
      
      let description = data?.teamMembersNotified 
        ? `${data.teamMembersNotified} team members have been notified.`
        : "Your team has been notified.";
      
      if (data?.deletedCount > 0) {
        description += ` (Cleaned up ${data.deletedCount} old version${data.deletedCount > 1 ? 's' : ''})`;
      }
      
      toast({
        title: "Setlist published!",
        description,
      });
    },
    onError: (error) => {
      toast({
        title: "Error publishing setlist",
        description: error.message,
        variant: "destructive",
      });
    },
  });
}
