export type TranscriptSegment = {
  start: number;
  end: number;
  text: string;
};

export type TranscriptWord = {
  word: string;
  start: number;
  end: number;
};

export type TranscriptionResult = {
  segments: TranscriptSegment[];
  words: TranscriptWord[];
  durationSeconds?: number;
};

const INTRO_WORD_REGEX = /^intro$/i;
const INTRO_PHRASE_REGEX = /\bintro\b/i;
const MARKER_OFFSET_SECONDS = 1.5;
// Songs in a worship set are minutes apart, so collapse any "intro" cues heard
// within this window into a single marker (avoids double-detecting one cue).
const MIN_MARKER_GAP_SECONDS = 12;
const MAX_TRANSCRIPTION_BYTES = 26_214_400; // 25 MiB hard limit on OpenAI audio transcription uploads.
const SAFE_HEADROOM_BYTES = 16_384;
const CHUNK_BYTES = MAX_TRANSCRIPTION_BYTES - SAFE_HEADROOM_BYTES;
const MAX_REFERENCE_TRACK_BYTES = MAX_TRANSCRIPTION_BYTES * 2;

function normalizeWord(word: string): string {
  return word.trim().toLowerCase().replace(/[^a-z]/g, "");
}

export async function transcribeAudioBlob(
  audioBlob: Blob,
  contentType = "audio/mpeg",
  options?: { durationSeconds?: number },
): Promise<TranscriptionResult> {
  const apiKey = Deno.env.get("OPENAI_API_KEY");
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not configured");
  }

  if (audioBlob.size > MAX_REFERENCE_TRACK_BYTES) {
    throw new Error(
      `reference_track_too_large_for_transcription (${audioBlob.size} bytes). Please upload a smaller/lower-bitrate reference track.`,
    );
  }

  if (audioBlob.size <= CHUNK_BYTES) {
    return transcribeAudioChunk(audioBlob, contentType, apiKey);
  }

  const knownDurationSeconds = isPositiveFiniteNumber(options?.durationSeconds)
    ? options.durationSeconds
    : undefined;
  const segments: TranscriptSegment[] = [];
  const words: TranscriptWord[] = [];
  let rollingOffsetSeconds = 0;

  for (let startByte = 0; startByte < audioBlob.size; startByte += CHUNK_BYTES) {
    const endByte = Math.min(startByte + CHUNK_BYTES, audioBlob.size);
    const chunk = audioBlob.slice(startByte, endByte, contentType);
    const chunkTranscription = await transcribeAudioChunk(chunk, contentType, apiKey);
    const chunkOffsetSeconds = knownDurationSeconds != null
      ? (startByte / audioBlob.size) * knownDurationSeconds
      : rollingOffsetSeconds;

    segments.push(
      ...chunkTranscription.segments.map((segment) => ({
        ...segment,
        start: segment.start + chunkOffsetSeconds,
        end: segment.end + chunkOffsetSeconds,
      })),
    );
    words.push(
      ...chunkTranscription.words.map((word) => ({
        ...word,
        start: word.start + chunkOffsetSeconds,
        end: word.end + chunkOffsetSeconds,
      })),
    );

    rollingOffsetSeconds += getTranscriptionDuration(chunkTranscription);
  }

  return {
    segments,
    words,
    durationSeconds: knownDurationSeconds ?? rollingOffsetSeconds,
  };
}

async function transcribeAudioChunk(
  audioBlob: Blob,
  contentType: string,
  apiKey: string,
): Promise<TranscriptionResult> {
  const fileName = `reference-track.${contentType.includes("wav") ? "wav" : "mp3"}`;

  const formData = new FormData();
  formData.append("file", new File([audioBlob], fileName, { type: contentType }));
  formData.append("model", "whisper-1");
  formData.append("response_format", "verbose_json");
  // Request word-level timestamps so we can pinpoint the exact moment the guide
  // voice says only the word "Intro" rather than the start of a multi-second segment.
  formData.append("timestamp_granularities[]", "word");
  formData.append("timestamp_granularities[]", "segment");
  formData.append(
    "prompt",
    'Cue voice says exactly "Intro" for song boundaries. Spoken guide track cues for worship songs.',
  );

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
  const segments: TranscriptSegment[] = rawSegments
    .map((segment: { start?: number; end?: number; text?: string }) => ({
      start: Number(segment.start || 0),
      end: Number(segment.end || 0),
      text: String(segment.text || ""),
    }))
    .filter((segment: TranscriptSegment) => segment.text.length > 0);

  const rawWords = Array.isArray(json?.words) ? json.words : [];
  const words: TranscriptWord[] = rawWords
    .map((w: { word?: string; start?: number; end?: number }) => ({
      word: String(w.word || ""),
      start: Number(w.start || 0),
      end: Number(w.end || 0),
    }))
    .filter((w: TranscriptWord) => w.word.length > 0);

  const durationSeconds = Number(json?.duration);

  return {
    segments,
    words,
    durationSeconds: Number.isFinite(durationSeconds) && durationSeconds > 0 ? durationSeconds : undefined,
  };
}

export async function transcribeAudioFromUrl(
  audioUrl: string,
  options?: { durationSeconds?: number },
): Promise<TranscriptionResult> {
  const audioResponse = await fetch(audioUrl);
  if (!audioResponse.ok) {
    throw new Error(`Unable to fetch reference track audio (${audioResponse.status})`);
  }

  const contentType = audioResponse.headers.get("content-type") || "audio/mpeg";
  const audioBlob = await audioResponse.blob();
  return transcribeAudioBlob(audioBlob, contentType, options);
}

/** Backwards-compatible helper returning only segments (used by chart reorder). */
export async function transcribeReferenceTrack(
  audioUrl: string,
  options?: { durationSeconds?: number },
): Promise<TranscriptSegment[]> {
  const { segments } = await transcribeAudioFromUrl(audioUrl, options);
  return segments;
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

function isPositiveFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function getTranscriptionDuration(transcription: TranscriptionResult): number {
  if (isPositiveFiniteNumber(transcription.durationSeconds)) {
    return transcription.durationSeconds;
  }

  const lastSegmentEnd = transcription.segments.reduce((latest, segment) => Math.max(latest, segment.end), 0);
  const lastWordEnd = transcription.words.reduce((latest, word) => Math.max(latest, word.end), 0);
  return Math.max(lastSegmentEnd, lastWordEnd);
}

/** Find timestamps where the spoken word "Intro" marks a new song boundary. */
export function detectIntroMarkerTimestamps(
  transcription: TranscriptionResult,
  options?: { offsetSeconds?: number; minGapSeconds?: number; maxMarkers?: number },
): number[] {
  const offsetSeconds = options?.offsetSeconds ?? MARKER_OFFSET_SECONDS;
  const minGapSeconds = options?.minGapSeconds ?? MIN_MARKER_GAP_SECONDS;
  const maxMarkers = options?.maxMarkers;

  // Prefer precise word-level timestamps when available.
  const wordMatches = transcription.words
    .filter((w) => INTRO_WORD_REGEX.test(normalizeWord(w.word)))
    .map((w) => Math.max(0, Math.round((w.start - offsetSeconds) * 10) / 10));

  const rawTimestamps = wordMatches.length > 0
    ? wordMatches
    : transcription.segments
        .filter((segment) => INTRO_PHRASE_REGEX.test(segment.text))
        .map((segment) => Math.max(0, Math.round(segment.start - offsetSeconds)));

  const deduped = dedupeCloseTimestamps(rawTimestamps, minGapSeconds);
  return maxMarkers != null ? deduped.slice(0, maxMarkers) : deduped;
}
