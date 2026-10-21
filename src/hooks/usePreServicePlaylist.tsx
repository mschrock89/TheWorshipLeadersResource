import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { liveStationLabel, type LiveStation } from "@/lib/liveMode";
import {
  PRE_SERVICE_BUCKET,
  fallbackPlaylistPeriod,
  serviceAudioFile,
  isPreServiceStation,
  playlistPeriodLabel,
  trackTitleFromFileName,
  type PreServiceStation,
} from "@/lib/preServicePlaylist";

export type PreServiceTrack = {
  id: string;
  title: string;
  storagePath: string;
  durationMs: number;
  sortOrder: number;
  url: string;
};

const EMPTY_TRACKS: PreServiceTrack[] = [];

type PlaylistRecord = {
  playlistId: string | null;
  tracks: PreServiceTrack[];
};

function isMissingPlaylistSchema(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const record = error as { message?: string; code?: string };
  const text = `${record.code || ""} ${record.message || ""}`.toLowerCase();
  return text.includes("pgrst205") || text.includes("schema cache") || text.includes("does not exist");
}

function readDurationMs(file: File) {
  return new Promise<number>((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const audio = document.createElement("audio");
    audio.preload = "metadata";
    const finish = (error?: Error, durationMs?: number) => {
      window.clearTimeout(timer);
      URL.revokeObjectURL(url);
      if (error || !durationMs) reject(error || new Error("Could not read that audio file."));
      else resolve(durationMs);
    };
    const timer = window.setTimeout(() => finish(new Error(`Could not read ${file.name}.`)), 15_000);
    audio.onloadedmetadata = () => {
      const durationMs = Math.round(audio.duration * 1000);
      if (!Number.isFinite(durationMs) || durationMs <= 0) {
        finish(new Error(`Could not read ${file.name}.`));
        return;
      }
      finish(undefined, durationMs);
    };
    audio.onerror = () => finish(new Error(`Could not read ${file.name}.`));
    audio.src = url;
  });
}

function trackUrl(storagePath: string) {
  return supabase.storage.from(PRE_SERVICE_BUCKET).getPublicUrl(storagePath).data.publicUrl;
}

export function usePreServicePlaylist({
  campusId,
  station,
  serviceDate,
  enabled,
  selectedPeriod,
}: {
  campusId: string;
  station: LiveStation;
  serviceDate: string;
  enabled: boolean;
  selectedPeriod?: { year: number; trimester: 1 | 2 | 3 };
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const playlistStation: PreServiceStation | null = isPreServiceStation(station) ? station : null;
  const active = enabled && !!playlistStation;
  const [pickedPeriod, setPickedPeriod] = useState<{ year: number; trimester: number } | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadLabel, setUploadLabel] = useState<string | null>(null);

  const periodQuery = useQuery({
    queryKey: ["pre-service-period", campusId, serviceDate],
    enabled: active && !selectedPeriod,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("rotation_periods")
        .select("year, trimester, campus_id")
        .lte("start_date", serviceDate)
        .gte("end_date", serviceDate);
      if (error) throw error;
      const rows = data || [];
      const match =
        rows.find((row) => row.campus_id === campusId) ||
        rows.find((row) => !row.campus_id) ||
        rows[0];
      if (!match || match.trimester < 1 || match.trimester > 3) return fallbackPlaylistPeriod(serviceDate);
      return { year: match.year, trimester: match.trimester as 1 | 2 | 3 };
    },
  });

  const servicePeriod = selectedPeriod ?? periodQuery.data ?? fallbackPlaylistPeriod(serviceDate);
  const period = selectedPeriod ?? pickedPeriod ?? servicePeriod;

  const playlistQuery = useQuery({
    queryKey: ["pre-service-playlist", campusId, playlistStation, period.year, period.trimester],
    enabled: active,
    retry: (count, error) => !isMissingPlaylistSchema(error) && count < 1,
    queryFn: async (): Promise<PlaylistRecord> => {
      const { data: playlist, error } = await supabase
        .from("pre_service_playlists")
        .select("id")
        .eq("campus_id", campusId)
        .eq("station", playlistStation!)
        .eq("year", period.year)
        .eq("trimester", period.trimester)
        .maybeSingle();
      if (error) throw error;
      if (!playlist) return { playlistId: null, tracks: [] };
      const { data: rows, error: trackError } = await supabase
        .from("pre_service_playlist_tracks")
        .select("id, title, storage_path, duration_ms, sort_order")
        .eq("playlist_id", playlist.id)
        .order("sort_order", { ascending: true });
      if (trackError) throw trackError;
      return {
        playlistId: playlist.id,
        tracks: (rows || []).map((row) => ({
          id: row.id,
          title: row.title,
          storagePath: row.storage_path,
          durationMs: row.duration_ms,
          sortOrder: row.sort_order,
          url: trackUrl(row.storage_path),
        })),
      };
    },
  });

  const tracks = playlistQuery.data?.tracks ?? EMPTY_TRACKS;
  const durationMs = tracks.reduce((sum, track) => sum + track.durationMs, 0);

  const refresh = async () => {
    await queryClient.invalidateQueries({
      queryKey: ["pre-service-playlist", campusId, playlistStation, period.year, period.trimester],
    });
  };

  const ensurePlaylistId = async () => {
    if (!playlistStation) throw new Error("Choose FOH or BCAST before uploading.");
    const existing = playlistQuery.data?.playlistId;
    if (existing) return existing;
    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError) throw userError;
    const userId = userData.user?.id;
    if (!userId) throw new Error("Sign in again before uploading.");
    const { data: created, error } = await supabase
      .from("pre_service_playlists")
      .insert({
        campus_id: campusId,
        station: playlistStation,
        year: period.year,
        trimester: period.trimester,
        created_by: userId,
      })
      .select("id")
      .single();
    if (error) throw error;
    return created.id;
  };

  const uploadFiles = async (files: File[]) => {
    const audioFiles = files.flatMap((file) => {
      const audio = serviceAudioFile(file);
      return audio ? [{ file, ...audio }] : [];
    });
    if (audioFiles.length === 0) {
      toast({
        title: "MP3 or M4A only",
        description: "Choose MP3 or M4A files for the pre-service playlist.",
        variant: "destructive",
      });
      return;
    }
    setUploading(true);
    try {
      const playlistId = await ensurePlaylistId();
      let order = (tracks.at(-1)?.sortOrder ?? -1) + 1;
      for (let index = 0; index < audioFiles.length; index += 1) {
        const { file, extension, contentType } = audioFiles[index];
        setUploadLabel(`Uploading ${index + 1} of ${audioFiles.length}`);
        const fileDuration = await readDurationMs(file);
        const storagePath = `${campusId}/${playlistStation}/${period.year}/t${period.trimester}/${crypto.randomUUID()}.${extension}`;
        const { error: uploadError } = await supabase.storage.from(PRE_SERVICE_BUCKET).upload(storagePath, file, {
          contentType,
          cacheControl: "31536000",
          upsert: false,
        });
        if (uploadError) throw uploadError;
        const { error: insertError } = await supabase.from("pre_service_playlist_tracks").insert({
          playlist_id: playlistId,
          title: trackTitleFromFileName(file.name),
          storage_path: storagePath,
          duration_ms: fileDuration,
          sort_order: order,
        });
        if (insertError) {
          await supabase.storage.from(PRE_SERVICE_BUCKET).remove([storagePath]);
          throw insertError;
        }
        order += 1;
      }
      await refresh();
      toast({
        title: "Playlist saved",
        description: `${liveStationLabel(station)} · ${playlistPeriodLabel(period.year, period.trimester)}`,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not save those audio files.";
      toast({ title: "Upload failed", description: message, variant: "destructive" });
    } finally {
      setUploading(false);
      setUploadLabel(null);
    }
  };

  const removeTrack = async (track: PreServiceTrack) => {
    const { error } = await supabase.from("pre_service_playlist_tracks").delete().eq("id", track.id);
    if (error) {
      toast({ title: "Could not remove that song", description: error.message, variant: "destructive" });
      return;
    }
    await supabase.storage.from(PRE_SERVICE_BUCKET).remove([track.storagePath]);
    await refresh();
  };

  const moveTrack = async (trackId: string, direction: -1 | 1) => {
    const index = tracks.findIndex((track) => track.id === trackId);
    const neighbor = tracks[index + direction];
    const track = tracks[index];
    if (!track || !neighbor) return;
    const [{ error: firstError }, { error: secondError }] = await Promise.all([
      supabase.from("pre_service_playlist_tracks").update({ sort_order: neighbor.sortOrder }).eq("id", track.id),
      supabase.from("pre_service_playlist_tracks").update({ sort_order: track.sortOrder }).eq("id", neighbor.id),
    ]);
    if (firstError || secondError) {
      toast({
        title: "Could not reorder",
        description: firstError?.message || secondError?.message,
        variant: "destructive",
      });
      return;
    }
    await refresh();
  };

  return {
    station: playlistStation,
    year: period.year,
    trimester: period.trimester,
    serviceYear: servicePeriod.year,
    serviceTrimester: servicePeriod.trimester,
    setPeriod: setPickedPeriod,
    tracks,
    durationMs,
    isLoading: active && (periodQuery.isLoading || playlistQuery.isLoading),
    schemaMissing: isMissingPlaylistSchema(playlistQuery.error),
    uploading,
    uploadLabel,
    uploadFiles,
    removeTrack,
    moveTrack,
  };
}
