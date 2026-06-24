export type TranscriptSegment = {
  start: number;
  end: number;
  text: string;
};

const INTRO_WORD_REGEX = /\bintro\b/i;
const MARKER_OFFSET_SECONDS = 1.5;
const MIN_MARKER_GAP_SECONDS = 3;

export async function transcribeAudioBlob(
  audioBlob: Blob,
  contentType = "audio/mpeg",
): Promise<TranscriptSegment[]> {
  const apiKey = Deno.env.get("OPENAI_API_KEY");
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not configured");
  }

  const MAX_TRANSCRIPTION_BYTES = 26_214_400; // 25 MiB hard limit on OpenAI audio transcription uploads.
  const SAFE_HEADROOM_BYTES = 16_384;

  const uploadBlob =
    audioBlob.size > MAX_TRANSCRIPTION_BYTES
      ? audioBlob.slice(0, Math.max(1, MAX_TRANSCRIPTION_BYTES - SAFE_HEADROOM_BYTES), contentType)
      : audioBlob;

  if (audioBlob.size > MAX_TRANSCRIPTION_BYTES * 2) {
    throw new Error(
      `reference_track_too_large_for_transcription (${audioBlob.size} bytes). Please upload a smaller/lower-bitrate reference track.`,
    );
  }

  const fileName = `reference-track.${contentType.includes("wav") ? "wav" : "mp3"}`;

  const formData = new FormData();
  formData.append("file", new File([uploadBlob], fileName, { type: contentType }));
  formData.append("model", "whisper-1");
  formData.append("response_format", "verbose_json");

  const response = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
    body: formData,
  });

  const json = await response.json();
  if (!response.ok) {
    throw new Error(json?.error?.message || "audio_transcription_failed");
  }

  const rawSegments = Array.isArray(json?.segments) ? json.segments : [];
  return rawSegments
    .map((segment: { start?: number; end?: number; text?: string }) => ({
      start: Number(segment.start || 0),
      end: Number(segment.end || 0),
      text: String(segment.text || ""),
    }))
    .filter((segment: TranscriptSegment) => segment.text.length > 0);
}

export async function transcribeReferenceTrack(audioUrl: string): Promise<TranscriptSegment[]> {
  const audioResponse = await fetch(audioUrl);
  if (!audioResponse.ok) {
    throw new Error(`Unable to fetch reference track audio (${audioResponse.status})`);
  }

  const contentType = audioResponse.headers.get("content-type") || "audio/mpeg";
  const audioBlob = await audioResponse.blob();
  return transcribeAudioBlob(audioBlob, contentType);
}

function dedupeCloseTimestamps(timestamps: number[], minGapSeconds: number): number[] {
  const sorted = [...timestamps].sort((a, b) => a - b);
  const result: number[] = [];

  for (const timestamp of sorted) {
    if (result.length === 0 || timestamp - result[result.length - 1] >= minGapSeconds) {
      result.push(timestamp);
    }
  }

  return result;
}

/** Find timestamps where the spoken word "Intro" marks a new song boundary. */
export function detectIntroMarkerTimestamps(
  segments: TranscriptSegment[],
  options?: { offsetSeconds?: number; minGapSeconds?: number; maxMarkers?: number },
): number[] {
  const offsetSeconds = options?.offsetSeconds ?? MARKER_OFFSET_SECONDS;
  const minGapSeconds = options?.minGapSeconds ?? MIN_MARKER_GAP_SECONDS;
  const maxMarkers = options?.maxMarkers;

  const rawTimestamps = segments
    .filter((segment) => INTRO_WORD_REGEX.test(segment.text))
    .map((segment) => Math.max(0, Math.round(segment.start - offsetSeconds)));

  const deduped = dedupeCloseTimestamps(rawTimestamps, minGapSeconds);
  return maxMarkers != null ? deduped.slice(0, maxMarkers) : deduped;
}
