const MAX_WAV_SAMPLES = Math.floor((350_000 - 44) / 2);

export function rmsFloat(samples: Float32Array) {
  if (samples.length === 0) return 0;
  let sum = 0;
  for (let index = 0; index < samples.length; index += 1) sum += samples[index] * samples[index];
  return Math.sqrt(sum / samples.length);
}

export function concatFloats(chunks: Float32Array[]) {
  const length = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const merged = new Float32Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.length;
  }
  return merged;
}

export function downsampleMono(samples: Float32Array, inputRate: number, outputRate: number) {
  if (samples.length === 0 || !inputRate || !outputRate || inputRate <= outputRate) return samples;
  const ratio = inputRate / outputRate;
  const length = Math.max(1, Math.floor(samples.length / ratio));
  const output = new Float32Array(length);
  for (let index = 0; index < length; index += 1) {
    const position = index * ratio;
    const left = Math.floor(position);
    const mix = position - left;
    const start = samples[left] || 0;
    const end = samples[Math.min(left + 1, samples.length - 1)] || start;
    output[index] = start + (end - start) * mix;
  }
  return output;
}

export function encodeMonoWavBytes(samples: Float32Array, sampleRate: number) {
  const pcm = samples.length > MAX_WAV_SAMPLES ? samples.subarray(0, MAX_WAV_SAMPLES) : samples;
  const buffer = new ArrayBuffer(44 + pcm.length * 2);
  const view = new DataView(buffer);
  const write = (offset: number, text: string) => {
    for (let index = 0; index < text.length; index += 1) view.setUint8(offset + index, text.charCodeAt(index));
  };
  write(0, "RIFF");
  view.setUint32(4, 36 + pcm.length * 2, true);
  write(8, "WAVE");
  write(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  write(36, "data");
  view.setUint32(40, pcm.length * 2, true);
  let offset = 44;
  for (let index = 0; index < pcm.length; index += 1) {
    const sample = Math.max(-1, Math.min(1, pcm[index]));
    view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
    offset += 2;
  }
  return buffer;
}

export function encodeMonoWav(samples: Float32Array, sampleRate: number) {
  return new Blob([encodeMonoWavBytes(samples, sampleRate)], { type: "audio/wav" });
}
