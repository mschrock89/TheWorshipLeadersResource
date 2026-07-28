import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { getCurrentResourceAppKey } from "@/lib/resourceApp";
import { toast } from "sonner";

export const DEVO_GUIDES_BUCKET = "devo_guides";
export const DEVO_OVERRIDE_NOTE = "Devo assignment";

export type DevoAssignmentStatus = "assigned" | "guide_uploaded" | "scheduled" | "posted" | "cancelled";

export type DevoSeriesStatus = "draft" | "published";

export type DevoSeries = {
  id: string;
  title: string;
  resource_app_key: string;
  starts_at: string;
  ends_at: string;
  default_permission_days: number;
  weeks_to_run: number | null;
  status: DevoSeriesStatus;
  campus_id: string | null;
  ministry_type: string | null;
  guide_storage_path: string | null;
  guide_file_name: string | null;
  guide_uploaded_at: string | null;
  guide_uploaded_by: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type DevoAssignment = {
  id: string;
  assignee_id: string;
  assigned_by: string | null;
  chapter_reference: string;
  series_title: string | null;
  series_id: string | null;
  due_date: string | null;
  scheduled_post_at: string | null;
  permission_duration_days: number | null;
  permission_starts_at: string | null;
  assign_push_sent_at: string | null;
  reminder_push_sent_at: string | null;
  status: DevoAssignmentStatus;
  guide_storage_path: string | null;
  guide_file_name: string | null;
  guide_uploaded_at: string | null;
  feed_post_id: string | null;
  resource_app_key: string;
  campus_id: string | null;
  ministry_type: string | null;
  post_feed_expires_at: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  assignee?: { id: string; full_name: string | null; email: string | null } | null;
  assigned_by_profile?: { id: string; full_name: string | null } | null;
  series?: Pick<
    DevoSeries,
    | "id"
    | "title"
    | "starts_at"
    | "ends_at"
    | "default_permission_days"
    | "status"
    | "guide_storage_path"
    | "guide_file_name"
  > | null;
};

export type DevoRosterEntry = {
  assignee_id: string;
  chapter_reference: string;
  post_date: string; // YYYY-MM-DD
  post_time: string; // HH:mm
  permission_duration_days?: number | null;
  notes?: string | null;
};

export type SaveDevoSeriesInput = {
  seriesId?: string | null;
  title: string;
  starts_at: string;
  ends_at: string;
  weeks_to_run?: number | null;
  default_permission_days: number;
  campus_id?: string | null;
  ministry_type?: string | null;
  roster: DevoRosterEntry[];
  mode: "draft" | "publish";
};

export type CreateDevoAssignmentInput = {
  assignee_id: string;
  chapter_reference: string;
  series_id?: string | null;
  series_title?: string | null;
  due_date?: string | null;
  scheduled_post_at?: string | null;
  permission_duration_days?: number | null;
  campus_id?: string | null;
  ministry_type?: string | null;
  notes?: string | null;
  send_assign_push?: boolean;
  /** When false, store permission window only — no grant yet (draft series). */
  grant_permission?: boolean;
};

const ACTIVE_STATUSES: DevoAssignmentStatus[] = ["assigned", "guide_uploaded", "scheduled"];

export function combineLocalDateAndTime(date: string, time: string): string {
  // Interpret as local wall clock, persist as ISO timestamptz.
  return new Date(`${date}T${time}:00`).toISOString();
}

export function splitLocalDateAndTime(iso: string | null | undefined): {
  date: string;
  time: string;
} {
  if (!iso) {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, "0");
    const d = String(now.getDate()).padStart(2, "0");
    return { date: `${y}-${m}-${d}`, time: "09:00" };
  }
  const value = new Date(iso);
  const y = value.getFullYear();
  const m = String(value.getMonth() + 1).padStart(2, "0");
  const d = String(value.getDate()).padStart(2, "0");
  const hh = String(value.getHours()).padStart(2, "0");
  const mm = String(value.getMinutes()).padStart(2, "0");
  return { date: `${y}-${m}-${d}`, time: `${hh}:${mm}` };
}

export function formatDevoPostDay(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

export function formatDevoPostTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
}

/** Permission opens N days before go-live and lasts through go-live + 1 day. */
export function computeDevoPermissionWindow(input: {
  scheduledPostAt: string;
  permissionDays?: number | null;
}): { startsAt: string; expiresAt: string } {
  const days = input.permissionDays && input.permissionDays > 0 ? input.permissionDays : 7;
  const scheduled = new Date(input.scheduledPostAt);
  const startsAt = new Date(scheduled);
  startsAt.setDate(startsAt.getDate() - days);
  const expiresAt = new Date(scheduled);
  expiresAt.setDate(expiresAt.getDate() + 1);
  return { startsAt: startsAt.toISOString(), expiresAt: expiresAt.toISOString() };
}

async function grantTemporaryPostFeed(userId: string, resourceApp: string, expiresAt: string) {
  const { data, error } = await supabase.rpc("grant_devo_post_feed", {
    _user_id: userId,
    _resource_app: resourceApp,
    _expires_at: expiresAt,
  });
  if (error) throw error;
  return Boolean(data);
}

async function maybeGrantPermissionForSchedule(input: {
  userId: string;
  resourceApp: string;
  scheduledPostAt: string | null | undefined;
  permissionDays: number;
}): Promise<{ granted: boolean; startsAt: string | null; expiresAt: string | null }> {
  if (!input.scheduledPostAt) {
    const expiresAt = new Date(Date.now() + input.permissionDays * 86_400_000).toISOString();
    const granted = await grantTemporaryPostFeed(input.userId, input.resourceApp, expiresAt);
    return { granted, startsAt: new Date().toISOString(), expiresAt: granted ? expiresAt : null };
  }

  const { startsAt, expiresAt } = computeDevoPermissionWindow({
    scheduledPostAt: input.scheduledPostAt,
    permissionDays: input.permissionDays,
  });

  if (Date.now() < new Date(startsAt).getTime()) {
    // Window not open yet — cron will grant when it starts.
    return { granted: false, startsAt, expiresAt };
  }

  const granted = await grantTemporaryPostFeed(input.userId, input.resourceApp, expiresAt);
  return { granted, startsAt, expiresAt };
}

async function maybeRevokeDevoPostFeed(userId: string, resourceApp: string) {
  const { error } = await supabase.rpc("revoke_devo_post_feed_if_idle", {
    _user_id: userId,
    _resource_app: resourceApp,
  });
  if (error) throw error;
}

export async function sendDevoAssignPush(
  assignment: Pick<
    DevoAssignment,
    "id" | "assignee_id" | "chapter_reference" | "series_title" | "scheduled_post_at" | "resource_app_key"
  >,
  createdBy?: string | null,
) {
  const chapter = assignment.chapter_reference;
  const postDay = formatDevoPostDay(assignment.scheduled_post_at);
  const postTime = formatDevoPostTime(assignment.scheduled_post_at);
  const seriesTitle = assignment.series_title || "DEVO";

  const { error } = await supabase.functions.invoke("send-push-notification", {
    body: {
      title: `You're writing ${chapter}`,
      message:
        `Goes live ${postDay} at ${postTime}. When your writing window opens, go to profile badge → DEVO for the how-to guide and to write your post. It publishes to The Feed at go-live.`,
      url: "/devo",
      tag: `devo-assigned-${assignment.id}`,
      userIds: [assignment.assignee_id],
      contextType: "devo-assigned",
      createdBy: createdBy || undefined,
      metadata: {
        resourceAppKey: assignment.resource_app_key,
        vars: {
          chapter,
          post_day: postDay,
          post_time: postTime,
          series_title: seriesTitle,
        },
      },
    },
  });

  if (error) throw error;

  await supabase
    .from("devo_assignments")
    .update({ assign_push_sent_at: new Date().toISOString() })
    .eq("id", assignment.id);
}

export function useDevoSeriesList() {
  const { user } = useAuth();
  const resourceApp = getCurrentResourceAppKey();

  return useQuery({
    queryKey: ["devo-series", resourceApp],
    enabled: !!user?.id,
    queryFn: async (): Promise<DevoSeries[]> => {
      const { data, error } = await supabase
        .from("devo_series")
        .select("*")
        .eq("resource_app_key", resourceApp)
        .order("starts_at", { ascending: false });
      if (error) throw error;
      return (data || []) as DevoSeries[];
    },
  });
}

export function useMyDevoAssignments() {
  const { user } = useAuth();
  const resourceApp = getCurrentResourceAppKey();

  return useQuery({
    queryKey: ["devo-assignments", "mine", user?.id, resourceApp],
    enabled: !!user?.id,
    queryFn: async (): Promise<DevoAssignment[]> => {
      const { data, error } = await supabase
        .from("devo_assignments")
        .select(
          `
          *,
          series:devo_series(id, title, starts_at, ends_at, default_permission_days, status, guide_storage_path, guide_file_name)
        `,
        )
        .eq("assignee_id", user!.id)
        .eq("resource_app_key", resourceApp)
        .neq("status", "cancelled")
        .order("scheduled_post_at", { ascending: true, nullsFirst: false })
        .order("created_at", { ascending: false });
      if (error) throw error;
      // Hide assignments that belong to unpublished draft series.
      return ((data || []) as DevoAssignment[]).filter(
        (row) => !row.series_id || !row.series || row.series.status === "published",
      );
    },
  });
}

export function useMyIncompleteDevoCount() {
  const query = useMyDevoAssignments();
  return {
    ...query,
    data: (query.data || []).filter((a) => ACTIVE_STATUSES.includes(a.status)).length,
  };
}

export function useAdminDevoAssignments(seriesId?: string | null) {
  const { user } = useAuth();
  const resourceApp = getCurrentResourceAppKey();

  return useQuery({
    queryKey: ["devo-assignments", "admin", resourceApp, seriesId || "all"],
    enabled: !!user?.id,
    queryFn: async (): Promise<DevoAssignment[]> => {
      let query = supabase
        .from("devo_assignments")
        .select(
          `
          *,
          assignee:profiles!devo_assignments_assignee_id_fkey(id, full_name, email),
          assigned_by_profile:profiles!devo_assignments_assigned_by_fkey(id, full_name),
          series:devo_series(id, title, starts_at, ends_at, default_permission_days, status, guide_storage_path, guide_file_name)
        `,
        )
        .eq("resource_app_key", resourceApp)
        .order("scheduled_post_at", { ascending: true, nullsFirst: false })
        .order("created_at", { ascending: false });

      if (seriesId) query = query.eq("series_id", seriesId);

      const { data, error } = await query;
      if (error) throw error;
      return (data || []) as DevoAssignment[];
    },
  });
}

export function useSaveDevoSeries() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const resourceApp = getCurrentResourceAppKey();

  return useMutation({
    mutationFn: async (input: SaveDevoSeriesInput) => {
      if (!user?.id) throw new Error("You must be signed in.");

      const title = input.title.trim();
      if (!title) throw new Error("Series title is required.");
      if (input.mode === "publish" && !input.roster.length) {
        throw new Error("Add at least one person to the roster before publishing.");
      }
      if (input.mode === "publish" && !input.campus_id) {
        throw new Error("Pick a campus so posts can go live on The Feed.");
      }

      const seriesPayload = {
        title,
        resource_app_key: resourceApp,
        starts_at: input.starts_at,
        ends_at: input.ends_at,
        weeks_to_run: input.weeks_to_run ?? null,
        default_permission_days: input.default_permission_days,
        campus_id: input.campus_id || null,
        ministry_type: input.ministry_type || null,
        status: input.mode === "publish" ? ("published" as const) : ("draft" as const),
        updated_at: new Date().toISOString(),
      };

      let series: DevoSeries;
      if (input.seriesId) {
        const { data, error } = await supabase
          .from("devo_series")
          .update(seriesPayload)
          .eq("id", input.seriesId)
          .eq("resource_app_key", resourceApp)
          .select("*")
          .single();
        if (error) throw error;
        series = data as DevoSeries;
      } else {
        const { data, error } = await supabase
          .from("devo_series")
          .insert({
            ...seriesPayload,
            created_by: user.id,
          })
          .select("*")
          .single();
        if (error) throw error;
        series = data as DevoSeries;
      }

      const { data: existingRows, error: existingError } = await supabase
        .from("devo_assignments")
        .select("*")
        .eq("series_id", series.id)
        .neq("status", "cancelled");
      if (existingError) throw existingError;

      const existing = (existingRows || []) as DevoAssignment[];
      const keptIds = new Set<string>();
      const synced: DevoAssignment[] = [];
      const grantAndNotify = input.mode === "publish";

      for (const entry of input.roster) {
        const chapter = entry.chapter_reference.trim();
        if (!chapter) throw new Error("Every roster row needs a chapter.");
        if (!entry.assignee_id) throw new Error("Every roster row needs a person.");
        if (!entry.post_date || !entry.post_time) {
          throw new Error("Every roster row needs a post day and time.");
        }

        const scheduledPostAt = combineLocalDateAndTime(entry.post_date, entry.post_time);
        const permissionDays = entry.permission_duration_days ?? input.default_permission_days;
        const match = existing.find(
          (row) =>
            !keptIds.has(row.id) &&
            row.assignee_id === entry.assignee_id &&
            row.chapter_reference === chapter,
        );

        let permission = {
          granted: false,
          startsAt: null as string | null,
          expiresAt: null as string | null,
        };
        // Drafts store schedule only — no permission window until publish.
        if (grantAndNotify) {
          permission = await maybeGrantPermissionForSchedule({
            userId: entry.assignee_id,
            resourceApp,
            scheduledPostAt,
            permissionDays,
          });
        }

        if (match) {
          keptIds.add(match.id);
          const { data: updated, error } = await supabase
            .from("devo_assignments")
            .update({
              assigned_by: user.id,
              series_title: title,
              due_date: entry.post_date,
              scheduled_post_at: scheduledPostAt,
              permission_duration_days: permissionDays,
              permission_starts_at: permission.startsAt,
              campus_id: input.campus_id || null,
              ministry_type: input.ministry_type || null,
              notes: entry.notes?.trim() || null,
              post_feed_expires_at: permission.expiresAt,
              updated_at: new Date().toISOString(),
            })
            .eq("id", match.id)
            .select("*")
            .single();
          if (error) throw error;
          const row = updated as DevoAssignment;
          if (grantAndNotify && !row.assign_push_sent_at) {
            try {
              await sendDevoAssignPush(row, user.id);
            } catch (pushError) {
              console.error("DEVO assign push failed:", pushError);
            }
          }
          synced.push(row);
        } else {
          const { data: inserted, error } = await supabase
            .from("devo_assignments")
            .insert({
              assignee_id: entry.assignee_id,
              assigned_by: user.id,
              chapter_reference: chapter,
              series_id: series.id,
              series_title: title,
              due_date: entry.post_date,
              scheduled_post_at: scheduledPostAt,
              permission_duration_days: permissionDays,
              permission_starts_at: permission.startsAt,
              campus_id: input.campus_id || null,
              ministry_type: input.ministry_type || null,
              notes: entry.notes?.trim() || null,
              resource_app_key: resourceApp,
              status: "assigned",
              post_feed_expires_at: permission.expiresAt,
            })
            .select("*")
            .single();
          if (error) throw error;
          const row = inserted as DevoAssignment;
          keptIds.add(row.id);
          if (grantAndNotify) {
            try {
              await sendDevoAssignPush(row, user.id);
            } catch (pushError) {
              console.error("DEVO assign push failed:", pushError);
            }
          }
          synced.push(row);
        }
      }

      for (const row of existing) {
        if (keptIds.has(row.id) || row.status === "posted" || row.status === "scheduled") continue;
        await supabase
          .from("devo_assignments")
          .update({ status: "cancelled", updated_at: new Date().toISOString() })
          .eq("id", row.id);
        try {
          await maybeRevokeDevoPostFeed(row.assignee_id, resourceApp);
        } catch (revokeError) {
          console.error("DEVO revoke failed:", revokeError);
        }
      }

      return { series, assignments: synced, mode: input.mode };
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["devo-series"] });
      queryClient.invalidateQueries({ queryKey: ["devo-assignments"] });
      queryClient.invalidateQueries({ queryKey: ["capabilities"] });
      toast.success(
        result.mode === "draft"
          ? "Draft saved — roster kept"
          : "Series published and team notified",
      );
    },
    onError: (error: Error) => {
      toast.error(error.message || "Couldn't save series");
    },
  });
}

/** @deprecated Use useSaveDevoSeries */
export function useCreateDevoSeriesWithRoster() {
  return useSaveDevoSeries();
}

export function useCreateDevoAssignment() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const resourceApp = getCurrentResourceAppKey();

  return useMutation({
    mutationFn: async (input: CreateDevoAssignmentInput) => {
      if (!user?.id) throw new Error("You must be signed in.");

      const chapter = input.chapter_reference.trim();
      if (!chapter) throw new Error("Chapter is required.");

      const scheduledPostAt = input.scheduled_post_at || null;
      const dueDate =
        input.due_date ||
        (scheduledPostAt ? splitLocalDateAndTime(scheduledPostAt).date : null);
      const permissionDays = input.permission_duration_days ?? 7;
      const shouldGrant = input.grant_permission !== false;
      let permission = {
        granted: false,
        startsAt: null as string | null,
        expiresAt: null as string | null,
      };
      if (shouldGrant) {
        permission = await maybeGrantPermissionForSchedule({
          userId: input.assignee_id,
          resourceApp,
          scheduledPostAt,
          permissionDays,
        });
      }
      // Draft adds keep permission fields null until the series is published.

      const { data, error } = await supabase
        .from("devo_assignments")
        .insert({
          assignee_id: input.assignee_id,
          assigned_by: user.id,
          chapter_reference: chapter,
          series_id: input.series_id || null,
          series_title: input.series_title?.trim() || null,
          due_date: dueDate,
          scheduled_post_at: scheduledPostAt,
          permission_duration_days: permissionDays,
          permission_starts_at: permission.startsAt,
          campus_id: input.campus_id || null,
          ministry_type: input.ministry_type || null,
          notes: input.notes?.trim() || null,
          resource_app_key: resourceApp,
          status: "assigned",
          post_feed_expires_at: permission.expiresAt,
        })
        .select("*")
        .single();
      if (error) throw error;

      const assignment = data as DevoAssignment;
      if (input.send_assign_push !== false && shouldGrant) {
        try {
          await sendDevoAssignPush(assignment, user.id);
        } catch (pushError) {
          console.error("DEVO assign push failed:", pushError);
        }
      }

      return assignment;
    },
    onSuccess: (assignment) => {
      queryClient.invalidateQueries({ queryKey: ["devo-assignments"] });
      queryClient.invalidateQueries({ queryKey: ["capabilities"] });
      queryClient.invalidateQueries({ queryKey: ["admin", "overrides", assignment.assignee_id] });
      toast.success("Devotional assigned");
    },
    onError: (error: Error) => {
      toast.error(error.message || "Couldn't create assignment");
    },
  });
}

export function useUploadDevoSeriesGuide() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (input: { series: DevoSeries; file: File }) => {
      if (!user?.id) throw new Error("You must be signed in.");
      if (!input.series.id) throw new Error("Save the series first, then upload the how-to guide.");

      const safeName = input.file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const filePath = `series/${input.series.id}/${Date.now()}-${safeName}`;

      const { error: uploadError } = await supabase.storage
        .from(DEVO_GUIDES_BUCKET)
        .upload(filePath, input.file, {
          cacheControl: "3600",
          upsert: false,
          contentType: input.file.type || undefined,
        });
      if (uploadError) throw uploadError;

      const previousPath = input.series.guide_storage_path;

      const { data, error } = await supabase
        .from("devo_series")
        .update({
          guide_storage_path: filePath,
          guide_file_name: input.file.name,
          guide_uploaded_at: new Date().toISOString(),
          guide_uploaded_by: user.id,
          updated_at: new Date().toISOString(),
        })
        .eq("id", input.series.id)
        .select("*")
        .single();

      if (error) {
        await supabase.storage.from(DEVO_GUIDES_BUCKET).remove([filePath]);
        throw error;
      }

      if (previousPath && previousPath !== filePath) {
        await supabase.storage.from(DEVO_GUIDES_BUCKET).remove([previousPath]);
      }

      return data as DevoSeries;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["devo-series"] });
      queryClient.invalidateQueries({ queryKey: ["devo-assignments"] });
      toast.success("How-to guide uploaded");
    },
    onError: (error: Error) => {
      toast.error(error.message || "Couldn't upload guide");
    },
  });
}

/** @deprecated Use useUploadDevoSeriesGuide — guides are admin-uploaded on the series. */
export function useUploadDevoGuide() {
  return useUploadDevoSeriesGuide();
}

export function useMarkDevoPosted() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: { assignmentId: string; feedPostId?: string | null }) => {
      const { data, error } = await supabase
        .from("devo_assignments")
        .update({
          status: "posted",
          feed_post_id: input.feedPostId ?? null,
        })
        .eq("id", input.assignmentId)
        .select("*")
        .single();
      if (error) throw error;
      return data as DevoAssignment;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["devo-assignments"] });
      toast.success("Marked as posted");
    },
    onError: (error: Error) => {
      toast.error(error.message || "Couldn't update assignment");
    },
  });
}

export function useCancelDevoAssignment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (assignment: DevoAssignment) => {
      const { data, error } = await supabase
        .from("devo_assignments")
        .update({ status: "cancelled" })
        .eq("id", assignment.id)
        .select("*")
        .single();
      if (error) throw error;

      await maybeRevokeDevoPostFeed(assignment.assignee_id, assignment.resource_app_key);
      return data as DevoAssignment;
    },
    onSuccess: (assignment) => {
      queryClient.invalidateQueries({ queryKey: ["devo-assignments"] });
      queryClient.invalidateQueries({ queryKey: ["capabilities"] });
      queryClient.invalidateQueries({ queryKey: ["admin", "overrides", assignment.assignee_id] });
      toast.success("Assignment cancelled");
    },
    onError: (error: Error) => {
      toast.error(error.message || "Couldn't cancel assignment");
    },
  });
}

export type SaveDevoFeedPostInput = {
  assignment: DevoAssignment;
  title: string;
  body: string;
};

export function useSaveDevoScheduledPost() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const resourceApp = getCurrentResourceAppKey();

  return useMutation({
    mutationFn: async (input: SaveDevoFeedPostInput) => {
      if (!user?.id) throw new Error("You must be signed in.");
      if (input.assignment.assignee_id !== user.id) {
        throw new Error("Only the assignee can write this DEVO.");
      }

      const title = input.title.trim();
      const body = input.body.trim();
      if (!title) throw new Error("Add a title for your post.");
      if (!body) throw new Error("Write your devotion before scheduling it.");

      const goesLiveAt = input.assignment.scheduled_post_at;
      if (!goesLiveAt) throw new Error("This assignment has no go-live time yet.");

      const campusId = input.assignment.campus_id;
      const ministryType = input.assignment.ministry_type;
      if (!campusId || !ministryType) {
        throw new Error("This assignment is missing campus/ministry for The Feed.");
      }

      const liveNow = new Date(goesLiveAt).getTime() <= Date.now();
      const nextStatus: DevoAssignmentStatus = liveNow ? "posted" : "scheduled";

      let feedPostId = input.assignment.feed_post_id;

      if (feedPostId) {
        const { error } = await supabase
          .from("feed_posts")
          .update({
            category: "scripture",
            title,
            body,
            scripture_reference: input.assignment.chapter_reference,
            updated_by: user.id,
            goes_live_at: goesLiveAt,
            campus_id: campusId,
            ministry_type: ministryType,
            resource_app_key: resourceApp,
          })
          .eq("id", feedPostId)
          .eq("created_by", user.id);
        if (error) throw error;
      } else {
        const { data, error } = await supabase
          .from("feed_posts")
          .insert({
            category: "scripture",
            title,
            body,
            scripture_reference: input.assignment.chapter_reference,
            created_by: user.id,
            updated_by: user.id,
            resource_app_key: resourceApp,
            campus_id: campusId,
            camp_instance_id: null,
            ministry_type: ministryType,
            goes_live_at: goesLiveAt,
          })
          .select("id")
          .single();
        if (error) throw error;
        feedPostId = data.id;

        // Immediate notify only if already past go-live (trigger also handles this).
        if (liveNow) {
          try {
            await supabase.functions.invoke("notify-feed-post", {
              body: {
                postId: feedPostId,
                resourceAppKey: resourceApp,
                campusId,
                campInstanceId: null,
                ministryType,
              },
            });
          } catch (notificationError) {
            console.error("Failed to send feed notification:", notificationError);
          }
        }
      }

      const { data: assignment, error: assignmentError } = await supabase
        .from("devo_assignments")
        .update({
          feed_post_id: feedPostId,
          status: nextStatus,
        })
        .eq("id", input.assignment.id)
        .select("*")
        .single();
      if (assignmentError) throw assignmentError;

      return assignment as DevoAssignment;
    },
    onSuccess: (assignment) => {
      queryClient.invalidateQueries({ queryKey: ["devo-assignments"] });
      queryClient.invalidateQueries({ queryKey: ["feed-posts"] });
      toast.success(
        assignment.status === "posted"
          ? "Posted to The Feed"
          : "Saved — it will go live on The Feed at your scheduled time",
      );
    },
    onError: (error: Error) => {
      toast.error(error.message || "Couldn't save your DEVO");
    },
  });
}

export async function getDevoGuideSignedUrl(storagePath: string): Promise<string | null> {
  const { data, error } = await supabase.storage
    .from(DEVO_GUIDES_BUCKET)
    .createSignedUrl(storagePath, 60 * 60);
  if (error) throw error;
  return data.signedUrl;
}

export async function fetchDevoFeedPostDraft(feedPostId: string | null | undefined) {
  if (!feedPostId) return null;
  const { data, error } = await supabase
    .from("feed_posts")
    .select("id, title, body, scripture_reference, goes_live_at")
    .eq("id", feedPostId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export function buildDevoFeedComposePath(assignment: Pick<DevoAssignment, "chapter_reference">) {
  const params = new URLSearchParams({
    compose: "scripture",
    reference: assignment.chapter_reference,
  });
  return `/feed?${params.toString()}`;
}
