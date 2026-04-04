import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Database, Json } from "@/integrations/supabase/types";
import { useAuth } from "@/hooks/useAuth";
import { useUserRoles } from "@/hooks/useUserRoles";
import { useToast } from "@/hooks/use-toast";

export type DrumPieceType =
  | "kick"
  | "rack_tom"
  | "floor_tom"
  | "snare"
  | "hi_hats"
  | "left_crash"
  | "right_crash"
  | "ride"
  | "custom";

export interface CymbalCrackMarker {
  id: string;
  x: number;
  y: number;
  description: string;
}

export interface DrumKitPiece {
  batter_expected_head_life_days: number | null;
  batter_head_brand: string | null;
  batter_head_installed_on: string | null;
  batter_head_model: string | null;
  cymbal_brand: string | null;
  cymbal_crack_markers: CymbalCrackMarker[] | null;
  cymbal_model: string | null;
  id: string;
  kit_id: string;
  layout_x: number | null;
  layout_y: number | null;
  piece_type: DrumPieceType | string;
  piece_label: string;
  reso_expected_head_life_days: number | null;
  reso_head_brand: string | null;
  reso_head_installed_on: string | null;
  reso_head_model: string | null;
  size_inches: number;
  sort_order: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface DrumKit {
  id: string;
  campus_id: string;
  name: string;
  description: string | null;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
  drum_kit_pieces: DrumKitPiece[];
}

export interface DrumKitPieceInput {
  batter_expected_head_life_days?: number | null;
  batter_head_brand?: string | null;
  batter_head_installed_on?: string | null;
  batter_head_model?: string | null;
  cymbal_brand?: string | null;
  cymbal_crack_markers?: CymbalCrackMarker[] | null;
  cymbal_model?: string | null;
  id?: string;
  layout_x?: number | null;
  layout_y?: number | null;
  piece_type: DrumPieceType | string;
  piece_label: string;
  reso_expected_head_life_days?: number | null;
  reso_head_brand?: string | null;
  reso_head_installed_on?: string | null;
  reso_head_model?: string | null;
  size_inches: number;
  sort_order: number;
  notes?: string | null;
}

export interface DrumKitInput {
  id?: string;
  campus_id: string;
  name: string;
  description?: string | null;
  pieces: DrumKitPieceInput[];
}

export interface DrumTechComment {
  id: string;
  campus_id: string;
  user_id: string;
  body: string;
  created_at: string;
  updated_at: string;
  author_name: string | null;
  author_avatar_url: string | null;
  like_count: number;
  dislike_count: number;
  my_reaction: DrumTechReactionType | null;
  reply_count: number;
  replies: DrumTechCommentReply[];
}

export type DrumTechReactionType = "like" | "dislike";

export interface DrumTechCommentReply {
  id: string;
  comment_id: string;
  user_id: string;
  body: string;
  created_at: string;
  updated_at: string;
  author_name: string | null;
  author_avatar_url: string | null;
}

type DrumTechCommentRow = Database["public"]["Tables"]["drum_tech_comments"]["Row"] & {
  author?: {
    full_name: string | null;
    avatar_url: string | null;
  } | null;
};

type DrumTechCommentReactionRow = Database["public"]["Tables"]["drum_tech_comment_reactions"]["Row"];
type DrumTechCommentReplyRow = Database["public"]["Tables"]["drum_tech_comment_replies"]["Row"] & {
  author?: {
    full_name: string | null;
    avatar_url: string | null;
  } | null;
};

const LOCAL_DRUM_KITS_KEY = "drum-tech-local-kits";

function isSchemaMismatchError(error: { code?: string; message?: string } | null) {
  if (!error) return false;
  return (
    error.code === "42P01" ||
    error.code === "42703" ||
    error.message?.toLowerCase().includes("could not find the table") ||
    error.message?.toLowerCase().includes("relation") ||
    error.message?.toLowerCase().includes("column")
  );
}

function normalizeCrackMarker(marker: unknown, index: number): CymbalCrackMarker | null {
  if (!marker || typeof marker !== "object") return null;

  const candidate = marker as Partial<CymbalCrackMarker>;
  const x = typeof candidate.x === "number" ? candidate.x : null;
  const y = typeof candidate.y === "number" ? candidate.y : null;

  if (x === null || y === null) return null;

  return {
    id: typeof candidate.id === "string" && candidate.id.length > 0 ? candidate.id : `marker-${index}`,
    x,
    y,
    description: typeof candidate.description === "string" ? candidate.description : "",
  };
}

function normalizePiece(piece: Partial<DrumKitPiece> & { piece_type?: string; piece_label?: string }, kitId: string, index: number): DrumKitPiece {
  const now = new Date().toISOString();
  const rawMarkers = Array.isArray(piece.cymbal_crack_markers) ? piece.cymbal_crack_markers : [];

  return {
    batter_expected_head_life_days:
      typeof piece.batter_expected_head_life_days === "number" ? piece.batter_expected_head_life_days : null,
    batter_head_brand: typeof piece.batter_head_brand === "string" ? piece.batter_head_brand : null,
    batter_head_installed_on: typeof piece.batter_head_installed_on === "string" ? piece.batter_head_installed_on : null,
    batter_head_model: typeof piece.batter_head_model === "string" ? piece.batter_head_model : null,
    cymbal_brand: typeof piece.cymbal_brand === "string" ? piece.cymbal_brand : null,
    cymbal_crack_markers: rawMarkers
      .map((marker, markerIndex) => normalizeCrackMarker(marker, markerIndex))
      .filter((marker): marker is CymbalCrackMarker => marker !== null),
    cymbal_model: typeof piece.cymbal_model === "string" ? piece.cymbal_model : null,
    id: typeof piece.id === "string" && piece.id.length > 0 ? piece.id : `local-piece-${crypto.randomUUID()}`,
    kit_id: typeof piece.kit_id === "string" && piece.kit_id.length > 0 ? piece.kit_id : kitId,
    layout_x: typeof piece.layout_x === "number" ? piece.layout_x : null,
    layout_y: typeof piece.layout_y === "number" ? piece.layout_y : null,
    piece_type: typeof piece.piece_type === "string" && piece.piece_type.length > 0 ? piece.piece_type : "custom",
    piece_label: typeof piece.piece_label === "string" && piece.piece_label.length > 0 ? piece.piece_label : "Custom Piece",
    reso_expected_head_life_days:
      typeof piece.reso_expected_head_life_days === "number" ? piece.reso_expected_head_life_days : null,
    reso_head_brand: typeof piece.reso_head_brand === "string" ? piece.reso_head_brand : null,
    reso_head_installed_on: typeof piece.reso_head_installed_on === "string" ? piece.reso_head_installed_on : null,
    reso_head_model: typeof piece.reso_head_model === "string" ? piece.reso_head_model : null,
    size_inches: typeof piece.size_inches === "number" && Number.isFinite(piece.size_inches) ? piece.size_inches : 18,
    sort_order: typeof piece.sort_order === "number" ? piece.sort_order : index,
    notes: typeof piece.notes === "string" ? piece.notes : null,
    created_at: typeof piece.created_at === "string" ? piece.created_at : now,
    updated_at: typeof piece.updated_at === "string" ? piece.updated_at : now,
  };
}

function normalizeKit(kit: Partial<DrumKit>, index: number): DrumKit {
  const now = new Date().toISOString();
  const kitId = typeof kit.id === "string" && kit.id.length > 0 ? kit.id : `local-kit-${index}`;
  const pieces = Array.isArray(kit.drum_kit_pieces) ? kit.drum_kit_pieces : [];

  return {
    id: kitId,
    campus_id: typeof kit.campus_id === "string" ? kit.campus_id : "",
    name: typeof kit.name === "string" ? kit.name : "Untitled Kit",
    description: typeof kit.description === "string" ? kit.description : null,
    created_by: typeof kit.created_by === "string" ? kit.created_by : null,
    updated_by: typeof kit.updated_by === "string" ? kit.updated_by : null,
    created_at: typeof kit.created_at === "string" ? kit.created_at : now,
    updated_at: typeof kit.updated_at === "string" ? kit.updated_at : now,
    drum_kit_pieces: pieces
      .map((piece, pieceIndex) => normalizePiece(piece, kitId, pieceIndex))
      .sort((a, b) => a.sort_order - b.sort_order),
  };
}

function getLocalDrumKits(): DrumKit[] {
  if (typeof window === "undefined") return [];

  try {
    const raw = window.localStorage.getItem(LOCAL_DRUM_KITS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map((kit, index) => normalizeKit(kit, index));
  } catch {
    return [];
  }
}

function saveLocalDrumKits(kits: DrumKit[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(LOCAL_DRUM_KITS_KEY, JSON.stringify(kits));
}

function upsertLocalDrumKit(input: DrumKitInput): string {
  const now = new Date().toISOString();
  const existing = getLocalDrumKits();
  const kitId = input.id || `local-kit-${crypto.randomUUID()}`;

  const nextKit: DrumKit = {
    id: kitId,
    campus_id: input.campus_id,
    name: input.name.trim(),
    description: input.description?.trim() || null,
    created_by: null,
    updated_by: null,
    created_at: existing.find((kit) => kit.id === kitId)?.created_at || now,
    updated_at: now,
    drum_kit_pieces: input.pieces.map((piece, index) => ({
      cymbal_brand: piece.cymbal_brand?.trim() || null,
      cymbal_crack_markers: piece.cymbal_crack_markers || null,
      cymbal_model: piece.cymbal_model?.trim() || null,
      id: piece.id || `local-piece-${crypto.randomUUID()}`,
      kit_id: kitId,
      layout_x: piece.layout_x ?? null,
      layout_y: piece.layout_y ?? null,
      piece_type: piece.piece_type,
      piece_label: piece.piece_label.trim(),
      size_inches: piece.size_inches,
      sort_order: index,
      batter_head_brand: piece.batter_head_brand?.trim() || null,
      batter_head_model: piece.batter_head_model?.trim() || null,
      batter_head_installed_on: piece.batter_head_installed_on || null,
      batter_expected_head_life_days: piece.batter_expected_head_life_days ?? null,
      reso_head_brand: piece.reso_head_brand?.trim() || null,
      reso_head_model: piece.reso_head_model?.trim() || null,
      reso_head_installed_on: piece.reso_head_installed_on || null,
      reso_expected_head_life_days: piece.reso_expected_head_life_days ?? null,
      notes: piece.notes?.trim() || null,
      created_at: now,
      updated_at: now,
    })),
  };

  const updated = [...existing.filter((kit) => kit.id !== kitId), nextKit];
  saveLocalDrumKits(updated);
  return kitId;
}

function deleteLocalDrumKit(kitId: string) {
  const existing = getLocalDrumKits();
  saveLocalDrumKits(existing.filter((kit) => kit.id !== kitId));
}

function normalizeCrackMarkers(markers: CymbalCrackMarker[] | null | undefined): Json {
  if (!markers?.length) return [];
  return markers.map((marker) => ({
    id: marker.id,
    x: marker.x,
    y: marker.y,
    description: marker.description,
  }));
}

function buildDrumKitPiecesPayload(kitId: string, pieces: DrumKitPieceInput[], updatedAt: string) {
  return pieces.map((piece, index) => ({
    kit_id: kitId,
    piece_type: piece.piece_type,
    piece_label: piece.piece_label.trim(),
    size_inches: piece.size_inches,
    sort_order: index,
    layout_x: piece.layout_x ?? null,
    layout_y: piece.layout_y ?? null,
    cymbal_brand: piece.cymbal_brand?.trim() || null,
    cymbal_crack_markers: normalizeCrackMarkers(piece.cymbal_crack_markers),
    cymbal_model: piece.cymbal_model?.trim() || null,
    batter_head_brand: piece.batter_head_brand?.trim() || null,
    batter_head_model: piece.batter_head_model?.trim() || null,
    batter_head_installed_on: piece.batter_head_installed_on || null,
    batter_expected_head_life_days: piece.batter_expected_head_life_days ?? null,
    reso_head_brand: piece.reso_head_brand?.trim() || null,
    reso_head_model: piece.reso_head_model?.trim() || null,
    reso_head_installed_on: piece.reso_head_installed_on || null,
    reso_expected_head_life_days: piece.reso_expected_head_life_days ?? null,
    notes: piece.notes?.trim() || null,
    updated_at: updatedAt,
  }));
}

async function upsertDrumKitInSupabase(input: DrumKitInput, userId?: string | null) {
  const now = new Date().toISOString();
  const basePayload = {
    campus_id: input.campus_id,
    name: input.name.trim(),
    description: input.description?.trim() || null,
    updated_at: now,
    updated_by: userId ?? null,
  };

  let kitId = input.id;

  if (kitId && !kitId.startsWith("local-kit-")) {
    const { error } = await supabase.from("drum_kits").update(basePayload).eq("id", kitId);
    if (error) throw error;

    const { error: deleteError } = await supabase.from("drum_kit_pieces").delete().eq("kit_id", kitId);
    if (deleteError) throw deleteError;
  } else {
    const { data, error } = await supabase
      .from("drum_kits")
      .insert({
        ...basePayload,
        created_by: userId ?? null,
      })
      .select("id")
      .single();

    if (error) throw error;
    kitId = data.id;
  }

  if (!kitId) {
    throw new Error("Unable to save drum kit.");
  }

  const piecesPayload = buildDrumKitPiecesPayload(kitId, input.pieces, now);
  if (piecesPayload.length > 0) {
    const { error: insertError } = await supabase.from("drum_kit_pieces").insert(piecesPayload);
    if (insertError) throw insertError;
  }

  return kitId;
}

async function syncLocalDrumKitsToSupabase(userId?: string | null) {
  const localKits = getLocalDrumKits().filter((kit) => kit.id.startsWith("local-kit-"));
  if (localKits.length === 0) return;

  const campusIds = Array.from(new Set(localKits.map((kit) => kit.campus_id).filter(Boolean)));
  if (campusIds.length === 0) return;

  const { data: existingKits, error } = await supabase
    .from("drum_kits")
    .select("id, campus_id, name")
    .in("campus_id", campusIds);

  if (error) throw error;

  const remainingLocalKits: DrumKit[] = [];

  for (const localKit of localKits) {
    try {
      const matchingKit = (existingKits || []).find(
        (kit) =>
          kit.campus_id === localKit.campus_id &&
          kit.name.trim().toLowerCase() === localKit.name.trim().toLowerCase(),
      );

      await upsertDrumKitInSupabase(
        {
          id: matchingKit?.id,
          campus_id: localKit.campus_id,
          name: localKit.name,
          description: localKit.description,
          pieces: localKit.drum_kit_pieces.map((piece) => ({
            piece_type: piece.piece_type,
            piece_label: piece.piece_label,
            size_inches: piece.size_inches,
            sort_order: piece.sort_order,
            layout_x: piece.layout_x,
            layout_y: piece.layout_y,
            cymbal_brand: piece.cymbal_brand,
            cymbal_crack_markers: piece.cymbal_crack_markers || [],
            cymbal_model: piece.cymbal_model,
            batter_head_brand: piece.batter_head_brand,
            batter_head_model: piece.batter_head_model,
            batter_head_installed_on: piece.batter_head_installed_on,
            batter_expected_head_life_days: piece.batter_expected_head_life_days,
            reso_head_brand: piece.reso_head_brand,
            reso_head_model: piece.reso_head_model,
            reso_head_installed_on: piece.reso_head_installed_on,
            reso_expected_head_life_days: piece.reso_expected_head_life_days,
            notes: piece.notes,
          })),
        },
        userId,
      );
    } catch {
      remainingLocalKits.push(localKit);
    }
  }

  const nonLocalKits = getLocalDrumKits().filter((kit) => !kit.id.startsWith("local-kit-"));
  saveLocalDrumKits([...nonLocalKits, ...remainingLocalKits]);
}

export function useDrumTechAccess(campusId?: string | null) {
  const { user } = useAuth();
  const { data: roles = [] } = useUserRoles(user?.id);

  const { data: assignments = { viewCampusIds: [], editCampusIds: [] } } = useQuery({
    queryKey: ["drum-tech-assignments", user?.id],
    queryFn: async () => {
      if (!user?.id) {
        return { viewCampusIds: [], editCampusIds: [] };
      }

      const { data, error } = await supabase
        .from("user_campus_ministry_positions")
        .select("campus_id, ministry_type, position")
        .eq("user_id", user.id);

      if (error) throw error;

      const rows = data || [];
      const normalizedRows = rows.map((row) => ({
        campus_id: row.campus_id,
        ministry_type: String(row.ministry_type || "").trim().toLowerCase(),
        position: String(row.position || "").trim().toLowerCase().replace(/\s+/g, "_"),
      }));
      const relevantRows = normalizedRows.filter(
        (row) =>
          row.ministry_type.length > 0 &&
          (row.position === "drums" || row.position === "drum_tech"),
      );

      return {
        viewCampusIds: Array.from(new Set(relevantRows.map((row) => row.campus_id))),
        editCampusIds: Array.from(
          new Set(
            relevantRows
              .filter((row) => row.position === "drum_tech")
              .map((row) => row.campus_id),
          ),
        ),
      };
    },
    enabled: !!user?.id,
  });

  return useMemo(() => {
    const roleNames = roles.map((role) => role.role);
    const isAdminLike = roleNames.includes("admin") || roleNames.includes("campus_admin");
    const assignedCampusIds = assignments.viewCampusIds;
    const editableCampusIds = assignments.editCampusIds;

    return {
      isAdminLike,
      assignedCampusIds,
      hasAnyAccess: isAdminLike || assignedCampusIds.length > 0,
      canEditCampus: !!campusId && (isAdminLike || editableCampusIds.includes(campusId)),
    };
  }, [assignments, campusId, roles]);
}

export function useDrumKits(campusId?: string | null) {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["drum-kits", campusId],
    enabled: !!campusId,
    queryFn: async () => {
      const localKits = getLocalDrumKits();

      if (localKits.length > 0) {
        try {
          await syncLocalDrumKitsToSupabase(user?.id);
        } catch (error) {
          if (isSchemaMismatchError(error as { code?: string; message?: string })) {
            return localKits.filter((kit) => kit.campus_id === campusId);
          }
          throw error;
        }
      }

      const { data, error } = await supabase
        .from("drum_kits")
        .select("*, drum_kit_pieces(*)")
        .eq("campus_id", campusId)
        .order("name", { ascending: true })
        .order("sort_order", { ascending: true, foreignTable: "drum_kit_pieces" });

      if (error) {
        if (isSchemaMismatchError(error)) {
          return getLocalDrumKits().filter((kit) => kit.campus_id === campusId);
        }
        throw error;
      }

      return ((data || []) as DrumKit[]).map((kit, index) => normalizeKit(kit, index));
    },
  });
}

export function useUpsertDrumKit() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (input: DrumKitInput) => {
      try {
        return await upsertDrumKitInSupabase(input, user?.id);
      } catch (error) {
        if (isSchemaMismatchError(error as { code?: string; message?: string })) {
          return upsertLocalDrumKit(input);
        }
        throw error;
      }
    },
    onSuccess: (kitId, variables) => {
      queryClient.invalidateQueries({ queryKey: ["drum-kits", variables.campus_id] });
      toast({
        title: variables.id ? "Kit updated" : "Kit created",
        description: kitId.startsWith("local-kit-")
          ? `${variables.name} was saved locally because the Drum Tech tables are not available yet.`
          : `${variables.name} is ready in Drum Tech.`,
      });
    },
    onError: (error) => {
      if (isSchemaMismatchError(error)) {
        return;
      }
      toast({
        title: "Unable to save kit",
        description: error.message,
        variant: "destructive",
      });
    },
    retry: false,
  });
}

export function useDeleteDrumKit() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ kitId }: { kitId: string; campusId: string }) => {
      if (kitId.startsWith("local-kit-")) {
        deleteLocalDrumKit(kitId);
        return;
      }
      const { error } = await supabase.from("drum_kits").delete().eq("id", kitId);
      if (error) throw error;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["drum-kits", variables.campusId] });
      toast({ title: "Kit deleted" });
    },
    onError: (error) => {
      if (isSchemaMismatchError(error)) {
        return;
      }
      toast({
        title: "Unable to delete kit",
        description: error.message,
        variant: "destructive",
      });
    },
    retry: false,
  });
}

export function useDrumTechComments(campusId?: string | null) {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["drum-tech-comments", campusId, user?.id],
    enabled: !!campusId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("drum_tech_comments")
        .select(`
          id,
          campus_id,
          user_id,
          body,
          created_at,
          updated_at,
          author:profiles!drum_tech_comments_user_id_fkey (
            full_name,
            avatar_url
          )
        `)
        .eq("campus_id", campusId)
        .order("created_at", { ascending: true });

      if (error) {
        if (isSchemaMismatchError(error)) {
          return [];
        }
        throw error;
      }

      const comments = (data || []) as DrumTechCommentRow[];

      if (comments.length === 0) {
        return [];
      }

      const commentIds = comments.map((comment) => comment.id);
      const { data: replyData, error: replyError } = await supabase
        .from("drum_tech_comment_replies")
        .select(`
          id,
          comment_id,
          user_id,
          body,
          created_at,
          updated_at,
          author:profiles!drum_tech_comment_replies_user_id_fkey (
            full_name,
            avatar_url
          )
        `)
        .in("comment_id", commentIds)
        .order("created_at", { ascending: true });

      if (replyError) {
        if (isSchemaMismatchError(replyError)) {
          return comments.map((comment) => ({
            id: comment.id,
            campus_id: comment.campus_id,
            user_id: comment.user_id,
            body: comment.body,
            created_at: comment.created_at,
            updated_at: comment.updated_at,
            author_name: comment.author?.full_name ?? null,
            author_avatar_url: comment.author?.avatar_url ?? null,
            like_count: 0,
            dislike_count: 0,
            my_reaction: null,
            reply_count: 0,
            replies: [],
          }));
        }
        throw replyError;
      }

      const { data: reactionData, error: reactionError } = await supabase
        .from("drum_tech_comment_reactions")
        .select("comment_id, user_id, reaction_type")
        .in("comment_id", commentIds);

      if (reactionError) {
        if (isSchemaMismatchError(reactionError)) {
          return comments.map((comment) => ({
            id: comment.id,
            campus_id: comment.campus_id,
            user_id: comment.user_id,
            body: comment.body,
            created_at: comment.created_at,
            updated_at: comment.updated_at,
            author_name: comment.author?.full_name ?? null,
            author_avatar_url: comment.author?.avatar_url ?? null,
            like_count: 0,
            dislike_count: 0,
            my_reaction: null,
            reply_count: ((replyData || []) as DrumTechCommentReplyRow[]).filter((reply) => reply.comment_id === comment.id).length,
            replies: ((replyData || []) as DrumTechCommentReplyRow[])
              .filter((reply) => reply.comment_id === comment.id)
              .map((reply) => ({
                id: reply.id,
                comment_id: reply.comment_id,
                user_id: reply.user_id,
                body: reply.body,
                created_at: reply.created_at,
                updated_at: reply.updated_at,
                author_name: reply.author?.full_name ?? null,
                author_avatar_url: reply.author?.avatar_url ?? null,
              })),
          }));
        }
        throw reactionError;
      }

      const repliesByCommentId = new Map<string, DrumTechCommentReply[]>();
      ((replyData || []) as DrumTechCommentReplyRow[]).forEach((reply) => {
        const existing = repliesByCommentId.get(reply.comment_id) || [];
        existing.push({
          id: reply.id,
          comment_id: reply.comment_id,
          user_id: reply.user_id,
          body: reply.body,
          created_at: reply.created_at,
          updated_at: reply.updated_at,
          author_name: reply.author?.full_name ?? null,
          author_avatar_url: reply.author?.avatar_url ?? null,
        });
        repliesByCommentId.set(reply.comment_id, existing);
      });

      const reactions = (reactionData || []) as DrumTechCommentReactionRow[];
      const likeCounts = new Map<string, number>();
      const dislikeCounts = new Map<string, number>();
      const myReactions = new Map<string, DrumTechReactionType>();

      reactions.forEach((reaction) => {
        if (reaction.reaction_type === "like") {
          likeCounts.set(reaction.comment_id, (likeCounts.get(reaction.comment_id) || 0) + 1);
        }
        if (reaction.reaction_type === "dislike") {
          dislikeCounts.set(reaction.comment_id, (dislikeCounts.get(reaction.comment_id) || 0) + 1);
        }
        if (user?.id && reaction.user_id === user.id) {
          myReactions.set(reaction.comment_id, reaction.reaction_type as DrumTechReactionType);
        }
      });

      return comments.map((comment) => ({
        id: comment.id,
        campus_id: comment.campus_id,
        user_id: comment.user_id,
        body: comment.body,
        created_at: comment.created_at,
        updated_at: comment.updated_at,
        author_name: comment.author?.full_name ?? null,
        author_avatar_url: comment.author?.avatar_url ?? null,
        like_count: likeCounts.get(comment.id) || 0,
        dislike_count: dislikeCounts.get(comment.id) || 0,
        my_reaction: myReactions.get(comment.id) || null,
        reply_count: (repliesByCommentId.get(comment.id) || []).length,
        replies: repliesByCommentId.get(comment.id) || [],
      }));
    },
  });
}

export function useCreateDrumTechComment() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ campusId, body }: { campusId: string; body: string }) => {
      if (!user?.id) throw new Error("You must be signed in to comment.");

      const trimmedBody = body.trim();
      if (!trimmedBody) throw new Error("Write a message before posting.");
      if (trimmedBody.length > 500) throw new Error("Messages must be 500 characters or less.");

      const { error } = await supabase.from("drum_tech_comments").insert({
        campus_id: campusId,
        user_id: user.id,
        body: trimmedBody,
      });

      if (error) throw error;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["drum-tech-comments", variables.campusId] });
    },
    onError: (error) => {
      toast({
        title: isSchemaMismatchError(error) ? "Comment board unavailable" : "Could not post message",
        description: isSchemaMismatchError(error)
          ? "The Drum Tech comment board needs the latest database migration before it can be used."
          : error.message,
        variant: "destructive",
      });
    },
    retry: false,
  });
}

export function useCreateDrumTechCommentReply() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ campusId, commentId, body }: { campusId: string; commentId: string; body: string }) => {
      if (!user?.id) throw new Error("You must be signed in to reply.");

      const trimmedBody = body.trim();
      if (!trimmedBody) throw new Error("Write a reply before posting.");
      if (trimmedBody.length > 500) throw new Error("Replies must be 500 characters or less.");

      const { error } = await supabase.from("drum_tech_comment_replies").insert({
        comment_id: commentId,
        user_id: user.id,
        body: trimmedBody,
      });

      if (error) throw error;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["drum-tech-comments", variables.campusId] });
    },
    onError: (error) => {
      toast({
        title: isSchemaMismatchError(error) ? "Replies unavailable" : "Could not post reply",
        description: isSchemaMismatchError(error)
          ? "The Drum Tech reply feature needs the latest database migration before it can be used."
          : error.message,
        variant: "destructive",
      });
    },
    retry: false,
  });
}

export function useToggleDrumTechCommentReaction() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({
      campusId,
      commentId,
      reactionType,
      currentReaction,
    }: {
      campusId: string;
      commentId: string;
      reactionType: DrumTechReactionType;
      currentReaction: DrumTechReactionType | null;
    }) => {
      if (!user?.id) throw new Error("You must be signed in to react.");

      if (currentReaction === reactionType) {
        const { error } = await supabase
          .from("drum_tech_comment_reactions")
          .delete()
          .eq("comment_id", commentId)
          .eq("user_id", user.id);

        if (error) throw error;
        return;
      }

      const { error } = await supabase
        .from("drum_tech_comment_reactions")
        .upsert(
          {
            comment_id: commentId,
            user_id: user.id,
            reaction_type: reactionType,
          },
          { onConflict: "comment_id,user_id" },
        );

      if (error) throw error;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["drum-tech-comments", variables.campusId] });
    },
    onError: (error) => {
      toast({
        title: isSchemaMismatchError(error) ? "Reactions unavailable" : "Could not update reaction",
        description: isSchemaMismatchError(error)
          ? "The Drum Tech reactions feature needs the latest database migration before it can be used."
          : error.message,
        variant: "destructive",
      });
    },
    retry: false,
  });
}
