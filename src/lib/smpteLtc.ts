export type SmpteParts = {
  hours: number;
  minutes: number;
  seconds: number;
  frames: number;
};

export type SmpteStamp = SmpteParts & {
  dropFrame: boolean;
  fps: number;
};

const SYNC = [0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 1];

export function formatSmpte(parts: SmpteParts) {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${pad(parts.hours)}:${pad(parts.minutes)}:${pad(parts.seconds)}:${pad(parts.frames)}`;
}

export function smpteSortKey(parts: SmpteParts, fps: number) {
  const rate = fps > 0 ? fps : 30;
  return ((parts.hours * 3600 + parts.minutes * 60 + parts.seconds) * rate) + parts.frames;
}

function putBits(bits: number[], offset: number, value: number, count: number) {
  for (let index = 0; index < count; index += 1) {
    bits[offset + index] = (value >> index) & 1;
  }
}

function readBits(bits: number[], offset: number, count: number) {
  let value = 0;
  for (let index = 0; index < count; index += 1) {
    if (bits[offset + index]) value += 1 << index;
  }
  return value;
}

export function buildLtcFrameBits(parts: SmpteParts, dropFrame = false) {
  const bits = new Array<number>(80).fill(0);
  putBits(bits, 0, parts.frames % 10, 4);
  putBits(bits, 8, Math.floor(parts.frames / 10), 2);
  if (dropFrame) bits[10] = 1;
  putBits(bits, 16, parts.seconds % 10, 4);
  putBits(bits, 24, Math.floor(parts.seconds / 10), 3);
  putBits(bits, 32, parts.minutes % 10, 4);
  putBits(bits, 40, Math.floor(parts.minutes / 10), 3);
  putBits(bits, 48, parts.hours % 10, 4);
  putBits(bits, 56, Math.floor(parts.hours / 10), 2);
  for (let index = 0; index < SYNC.length; index += 1) bits[64 + index] = SYNC[index];
  return bits;
}

export function parseLtcFrameBits(bits: number[], fps: number): SmpteStamp | null {
  if (bits.length < 80) return null;
  for (let index = 0; index < SYNC.length; index += 1) {
    if (bits[64 + index] !== SYNC[index]) return null;
  }
  const frames = readBits(bits, 0, 4) + readBits(bits, 8, 2) * 10;
  const seconds = readBits(bits, 16, 4) + readBits(bits, 24, 3) * 10;
  const minutes = readBits(bits, 32, 4) + readBits(bits, 40, 3) * 10;
  const hours = readBits(bits, 48, 4) + readBits(bits, 56, 2) * 10;
  if (hours > 23 || minutes > 59 || seconds > 59 || frames > 29) return null;
  return {
    hours,
    minutes,
    seconds,
    frames,
    dropFrame: bits[10] === 1,
    fps,
  };
}

export function encodeLtcPcm(stamps: SmpteParts[], sampleRate: number, fps: number, amplitude = 0.6) {
  const samplesPerBit = sampleRate / (fps * 80);
  const total = Math.floor(stamps.length * samplesPerBit * 80);
  const out = new Float32Array(total);
  let level = 1;
  let cursor = 0;
  for (const stamp of stamps) {
    for (const bit of buildLtcFrameBits(stamp)) {
      level = -level;
      const bitEnd = cursor + samplesPerBit;
      const mid = cursor + samplesPerBit / 2;
      const midIndex = Math.floor(mid);
      const endIndex = Math.min(out.length, Math.floor(bitEnd));
      const first = level * amplitude;
      for (let index = Math.floor(cursor); index < midIndex && index < out.length; index += 1) out[index] = first;
      if (bit === 1) level = -level;
      const second = level * amplitude;
      for (let index = midIndex; index < endIndex; index += 1) out[index] = second;
      cursor = bitEnd;
    }
  }
  return out;
}

function nearestFps(value: number) {
  return [24, 25, 30].reduce((best, fps) => (Math.abs(fps - value) < Math.abs(best - value) ? fps : best));
}

function median(values: number[]) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.floor(sorted.length / 2)] || 0;
}

export class LtcDecoder {
  private halfSamples = 0;
  private bitSamples = 0;
  private fps = 30;
  private calibrated = false;
  private intervals: number[] = [];
  private lastSign = 0;
  private sinceCross = 0;
  private halfPending = false;
  private bits: number[] = [];
  private hp = 0;
  private previous = 0;
  private sampleRate: number;

  constructor(sampleRate: number) {
    this.sampleRate = sampleRate;
  }

  push(samples: Float32Array): SmpteStamp | null {
    let latest: SmpteStamp | null = null;
    for (let index = 0; index < samples.length; index += 1) {
      const centered = this.highpass(samples[index] || 0);
      const sign = centered > 0.015 ? 1 : centered < -0.015 ? -1 : 0;
      this.sinceCross += 1;
      if (sign === 0 || sign === this.lastSign) continue;
      if (this.lastSign !== 0) {
        const decoded = this.consumeInterval(this.sinceCross);
        if (decoded) latest = decoded;
      }
      this.lastSign = sign;
      this.sinceCross = 0;
    }
    return latest;
  }

  private highpass(sample: number) {
    const next = 0.995 * (this.hp + sample - this.previous);
    this.previous = sample;
    this.hp = next;
    return next;
  }

  private consumeInterval(samples: number): SmpteStamp | null {
    if (!this.calibrated) {
      this.calibrate(samples);
      return null;
    }
    const half = this.halfSamples;
    if (half <= 0) return null;
    if (samples < half * 0.45) return null;
    if (samples < half * 1.45) {
      if (this.halfPending) {
        this.halfPending = false;
        return this.pushBit(1);
      }
      this.halfPending = true;
      return null;
    }
    if (samples < this.bitSamples * 1.45) {
      if (this.halfPending) {
        this.halfPending = false;
        this.bits = [];
        return null;
      }
      return this.pushBit(0);
    }
    this.halfPending = false;
    this.bits = [];
    return null;
  }

  private calibrate(samples: number) {
    if (samples < 2) return;
    this.intervals.push(samples);
    if (this.intervals.length < 180) return;
    const sorted = [...this.intervals].sort((left, right) => left - right);
    const guess = sorted[Math.floor(sorted.length * 0.08)] || 0;
    const shorts = this.intervals.filter((value) => value > guess * 0.65 && value < guess * 1.35);
    if (shorts.length < 8) {
      this.intervals = [];
      return;
    }
    const half = median(shorts);
    if (half < 2) {
      this.intervals = [];
      return;
    }
    this.halfSamples = half;
    this.bitSamples = half * 2;
    this.fps = nearestFps(this.sampleRate / (this.bitSamples * 80));
    this.calibrated = true;
    this.intervals = [];
    this.bits = [];
    this.halfPending = false;
  }

  private pushBit(bit: number): SmpteStamp | null {
    this.bits.push(bit);
    if (this.bits.length > 80) this.bits.shift();
    if (this.bits.length < 80) return null;
    return parseLtcFrameBits(this.bits, this.fps);
  }
}
