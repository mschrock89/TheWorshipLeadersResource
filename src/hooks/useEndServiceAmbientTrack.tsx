import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { liveStationLabel, type LiveStation } from "@/lib/liveMode";
import {
  serviceAudioFile,
  isPreServiceStation,
  trackTitleFromFileName,
  type PreServiceStation,
} from "@/lib/preServicePlaylist";

export const END_SERVICE_AUDIO_BUCKET = "end-service-audio";

export type EndServiceAmbientTrack = {
  id: string;
  title: string;
  storagePath: string;
  durationMs: number;
  url: string;
};

function isMissingSchema(error: unknown) {
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

function publicUrl(storagePath: string) {
  return supabase.storage.from(END_SERVICE_AUDIO_BUCKET).getPublicUrl(storagePath).data.publicUrl;
}

export function useEndServiceAmbientTrack({
  campusId,
  station,
  enabled,
}: {
  campusId: string;
  station: LiveStation;
  enabled: boolean;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const ambientStation: PreServiceStation | null = isPreServiceStation(station) ? station : null;
  const active = enabled && !!ambientStation && Boolean(campusId);
  const [uploading, setUploading] = useState(false);

  const queryKey = ["end-service-ambient-track", campusId, ambientStation] as const;
  const trackQuery = useQuery({
    queryKey,
    enabled: active,
    retry: (count, error) => !isMissingSchema(error) && count < 1,
    queryFn: async (): Promise<EndServiceAmbientTrack | null> => {
      const { data, error } = await supabase
        .from("end_service_ambient_tracks")
        .select("id, title, storage_path, duration_ms")
        .eq("campus_id", campusId)
        .eq("station", ambientStation!)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;
      return {
        id: data.id,
        title: data.title,
        storagePath: data.storage_path,
        durationMs: data.duration_ms,
        url: publicUrl(data.storage_path),
      };
    },
  });

  const uploadFile = async (file: File) => {
    if (!ambientStation) return;
    const audio = serviceAudioFile(file);
    if (!audio) {
      toast({
        title: "MP3 or M4A only",
        description: "Choose an MP3 or M4A for the end-of-service ambient track.",
        variant: "destructive",
      });
      return;
    }
    setUploading(true);
    const oldPath = trackQuery.data?.storagePath;
    let newPath: string | null = null;
    try {
      const durationMs = await readDurationMs(file);
      const { data: userData, error: userError } = await supabase.auth.getUser();
      if (userError) throw userError;
      const userId = userData.user?.id;
      if (!userId) throw new Error("Sign in again before uploading.");

      newPath = `${campusId}/${ambientStation}/${crypto.randomUUID()}.${audio.extension}`;
      const { error: uploadError } = await supabase.storage
        .from(END_SERVICE_AUDIO_BUCKET)
        .upload(newPath, file, {
          contentType: audio.contentType,
          cacheControl: "31536000",
          upsert: false,
        });
      if (uploadError) throw uploadError;

      const { error: saveError } = await supabase.from("end_service_ambient_tracks").upsert(
        {
          campus_id: campusId,
          station: ambientStation,
          title: trackTitleFromFileName(file.name),
          storage_path: newPath,
          duration_ms: durationMs,
          created_by: userId,
        },
        { onConflict: "campus_id,station" },
      );
      if (saveError) throw saveError;
      if (oldPath && oldPath !== newPath) {
        await supabase.storage.from(END_SERVICE_AUDIO_BUCKET).remove([oldPath]);
      }
      await queryClient.invalidateQueries({ queryKey });
      toast({
        title: "Ambient track saved",
        description: `${liveStationLabel(station)} will use this track in LIVE.`,
      });
    } catch (error) {
      if (newPath) await supabase.storage.from(END_SERVICE_AUDIO_BUCKET).remove([newPath]);
      toast({
        title: "Upload failed",
        description: error instanceof Error ? error.message : "Could not save that audio file.",
        variant: "destructive",
      });
    } finally {
      setUploading(false);
    }
  };

  const removeTrack = async () => {
    const track = trackQuery.data;
    if (!track) return;
    const { error } = await supabase.from("end_service_ambient_tracks").delete().eq("id", track.id);
    if (error) {
      toast({ title: "Could not remove that track", description: error.message, variant: "destructive" });
      return;
    }
    await supabase.storage.from(END_SERVICE_AUDIO_BUCKET).remove([track.storagePath]);
    await queryClient.invalidateQueries({ queryKey });
  };

  return {
    track: trackQuery.data ?? null,
    isLoading: active && trackQuery.isLoading,
    schemaMissing: isMissingSchema(trackQuery.error),
    uploading,
    uploadFile,
    removeTrack,
  };
}
