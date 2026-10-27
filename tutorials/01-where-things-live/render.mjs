import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import ffmpegPath from "ffmpeg-static";

const root = dirname(fileURLToPath(import.meta.url));
const script = JSON.parse(readFileSync(resolve(root, "script.json"), "utf8"));
const apiKey = process.env.ELEVENLABS_API_KEY;
const voiceId = process.env.ELEVENLABS_VOICE_ID || script.voice.voice_id;

if (!apiKey) {
  console.error("Set ELEVENLABS_API_KEY before rendering.");
  process.exit(1);
}
if (!ffmpegPath) {
  console.error("ffmpeg binary is missing.");
  process.exit(1);
}

const audioDir = resolve(root, "audio");
const outDir = resolve(root, "out");
mkdirSync(audioDir, { recursive: true });
mkdirSync(outDir, { recursive: true });

function mediaDurationSeconds(file) {
  const probe = spawnSync(ffmpegPath, ["-i", file], { encoding: "utf8" });
  const match = `${probe.stdout}\n${probe.stderr}`.match(/Duration:\s+(\d+):(\d+):(\d+(?:\.\d+)?)/);
  if (!match) throw new Error(`Could not read duration for ${file}`);
  return Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]);
}

async function synthesize(text, file) {
  const url = new URL(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`);
  url.searchParams.set("output_format", script.voice.output_format);
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "xi-api-key": apiKey,
      "Content-Type": "application/json",
      Accept: "audio/mpeg",
    },
    body: JSON.stringify({
      text,
      model_id: script.voice.model_id,
    }),
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`ElevenLabs ${response.status}: ${body.slice(0, 400)}`);
  }
  writeFileSync(file, Buffer.from(await response.arrayBuffer()));
}

const clips = [];
for (const [index, scene] of script.scenes.entries()) {
  const n = String(index + 1).padStart(2, "0");
  const audio = resolve(audioDir, `${n}.mp3`);
  const clip = resolve(outDir, `${n}.mp4`);
  process.stdout.write(`voice ${n}\n`);
  await synthesize(scene.narration, audio);
  const image = resolve(root, scene.image);
  const hold = (mediaDurationSeconds(audio) + 0.35).toFixed(2);
  const encoded = spawnSync(
    ffmpegPath,
    [
      "-y",
      "-loop", "1",
      "-framerate", "25",
      "-t", hold,
      "-i", image,
      "-i", audio,
      "-vf", "scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2,format=yuv420p",
      "-c:v", "libx264",
      "-tune", "stillimage",
      "-c:a", "libmp3lame",
      "-b:a", "192k",
      "-shortest",
      "-movflags", "+faststart",
      clip,
    ],
    { stdio: "inherit" },
  );
  if (encoded.status !== 0) process.exit(encoded.status ?? 1);
  clips.push(clip);
}

const output = resolve(outDir, "where-things-live.mp4");
const inputs = clips.flatMap((clip) => ["-i", clip]);
const chain = clips.map((_, index) => `[${index}:v:0][${index}:a:0]`).join("");
const joined = spawnSync(
  ffmpegPath,
  [
    "-y",
    ...inputs,
    "-filter_complex", `${chain}concat=n=${clips.length}:v=1:a=1[v][a]`,
    "-map", "[v]",
    "-map", "[a]",
    "-c:v", "libx264",
    "-pix_fmt", "yuv420p",
    "-c:a", "libmp3lame",
    "-b:a", "192k",
    "-movflags", "+faststart",
    output,
  ],
  { stdio: "inherit" },
);
if (joined.status !== 0) process.exit(joined.status ?? 1);
console.log(output);
