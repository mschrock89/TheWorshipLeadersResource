import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
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

export interface DrumKitPiece {
  id: string;
  kit_id: string;
  piece_type: DrumPieceType | string;
  piece_label: string;
  size_inches: number;
  sort_order: number;
  head_brand: string | null;
  head_model: string | null;
  head_installed_on: string | null;
  expected_head_life_days: number | null;
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
  id?: string;
  piece_type: DrumPieceType | string;
  piece_label: string;
  size_inches: number;
  sort_order: number;
  head_brand?: string | null;
  head_model?: string | null;
  head_installed_on?: string | null;
  expected_head_life_days?: number | null;
  notes?: string | null;
}

export interface DrumKitInput {
  id?: string;
  campus_id: string;
  name: string;
  description?: string | null;
  pieces: DrumKitPieceInput[];
}

export function useDrumTechAccess(campusId?: string | null) {
  const { user } = useAuth();
  const { data: roles = [] } = useUserRoles(user?.id);

  const { data: assignments = [] } = useQuery({
    queryKey: ["drum-tech-assignments", user?.id],
    queryFn: async () => {
      if (!user?.id) return [];

      const { data, error } = await supabase
        .from("user_campus_ministry_positions")
        .select("campus_id")
        .eq("user_id", user.id)
        .eq("position", "drum_tech");

      if (error) throw error;
      return (data || []).map((row) => row.campus_id);
    },
    enabled: !!user?.id,
  });

  return useMemo(() => {
    const roleNames = roles.map((role) => role.role);
    const isAdminLike = roleNames.includes("admin") || roleNames.includes("campus_admin");
    const assignedCampusIds = Array.from(new Set(assignments));

    return {
      isAdminLike,
      assignedCampusIds,
      hasAnyAccess: isAdminLike || assignedCampusIds.length > 0,
      canEditCampus: !!campusId && (isAdminLike || assignedCampusIds.includes(campusId)),
    };
  }, [assignments, campusId, roles]);
}

export function useDrumKits(campusId?: string | null) {
  return useQuery({
    queryKey: ["drum-kits", campusId],
    enabled: !!campusId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("drum_kits")
        .select("*, drum_kit_pieces(*)")
        .eq("campus_id", campusId)
        .order("name", { ascending: true })
        .order("sort_order", { ascending: true, foreignTable: "drum_kit_pieces" });

      if (error) throw error;

      return ((data || []) as DrumKit[]).map((kit) => ({
        ...kit,
        drum_kit_pieces: [...(kit.drum_kit_pieces || [])].sort((a, b) => a.sort_order - b.sort_order),
      }));
    },
  });
}

export function useUpsertDrumKit() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (input: DrumKitInput) => {
      const now = new Date().toISOString();
      const basePayload = {
        campus_id: input.campus_id,
        name: input.name.trim(),
        description: input.description?.trim() || null,
        updated_at: now,
        updated_by: user?.id ?? null,
      };

      let kitId = input.id;

      if (kitId) {
        const { error } = await supabase.from("drum_kits").update(basePayload).eq("id", kitId);
        if (error) throw error;

        const { error: deleteError } = await supabase.from("drum_kit_pieces").delete().eq("kit_id", kitId);
        if (deleteError) throw deleteError;
      } else {
        const { data, error } = await supabase
          .from("drum_kits")
          .insert({
            ...basePayload,
            created_by: user?.id ?? null,
          })
          .select("id")
          .single();

        if (error) throw error;
        kitId = data.id;
      }

      if (!kitId) {
        throw new Error("Unable to save drum kit.");
      }

      const piecesPayload = input.pieces.map((piece, index) => ({
        kit_id: kitId,
        piece_type: piece.piece_type,
        piece_label: piece.piece_label.trim(),
        size_inches: piece.size_inches,
        sort_order: index,
        head_brand: piece.head_brand?.trim() || null,
        head_model: piece.head_model?.trim() || null,
        head_installed_on: piece.head_installed_on || null,
        expected_head_life_days: piece.expected_head_life_days ?? null,
        notes: piece.notes?.trim() || null,
        updated_at: now,
      }));

      if (piecesPayload.length > 0) {
        const { error: insertError } = await supabase.from("drum_kit_pieces").insert(piecesPayload);
        if (insertError) throw insertError;
      }

      return kitId;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["drum-kits", variables.campus_id] });
      toast({
        title: variables.id ? "Kit updated" : "Kit created",
        description: `${variables.name} is ready in Drum Tech.`,
      });
    },
    onError: (error) => {
      toast({
        title: "Unable to save kit",
        description: error.message,
        variant: "destructive",
      });
    },
  });
}

export function useDeleteDrumKit() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ kitId }: { kitId: string; campusId: string }) => {
      const { error } = await supabase.from("drum_kits").delete().eq("id", kitId);
      if (error) throw error;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["drum-kits", variables.campusId] });
      toast({ title: "Kit deleted" });
    },
    onError: (error) => {
      toast({
        title: "Unable to delete kit",
        description: error.message,
        variant: "destructive",
      });
    },
  });
}
