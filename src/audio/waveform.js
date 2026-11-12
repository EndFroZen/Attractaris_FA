// Decoded take audio: AudioBuffers for playback (small LRU) and high-resolution peaks for drawing.
import { recordingBlob } from "../db.js";

const PEAK_RATE = 1000; // min/max pairs per second → sharp waveform down to ~1 ms per pixel
const BUFFER_SLOTS = 3; // decoded AudioBuffers kept in memory

const buffers = new Map(); // path → Promise<AudioBuffer>, insertion order = LRU
const peaks = new Map(); // path → Promise<{ peaks, rate, duration }>

/** Decoded audio for playback. */
export function takeBuffer(take) {
  const key = take.path;
  let p = buffers.get(key);
  if (p) {
    buffers.delete(key); // refresh LRU position
  } else {
    p = (async () => {
      const blob = take.blob ?? (await recordingBlob(take));
      const ctx = new OfflineAudioContext(1, 1, 48000);
      return ctx.decodeAudioData(await blob.arrayBuffer());
    })();
    p.catch(() => buffers.delete(key));
  }
  buffers.set(key, p);
  while (buffers.size > BUFFER_SLOTS) buffers.delete(buffers.keys().next().value);
  return p;
}

/** Waveform peaks: flat [lo0, hi0, lo1, hi1, …] at `rate` pairs per second. */
export function takePeaks(take) {
  const key = take.path;
  if (!peaks.has(key)) {
    const p = takeBuffer(take).then((audio) => {
      const ch0 = audio.getChannelData(0);
      const ch1 = audio.numberOfChannels > 1 ? audio.getChannelData(1) : null;
      const n = Math.max(1, Math.min(ch0.length, Math.ceil(audio.duration * PEAK_RATE)));
      const per = ch0.length / n;
      const out = new Float32Array(n * 2);
      for (let b = 0; b < n; b++) {
        let lo = 0;
        let hi = 0;
        const end = Math.min(ch0.length, Math.floor((b + 1) * per));
        for (let i = Math.floor(b * per); i < end; i++) {
          const v = ch1 ? (ch0[i] + ch1[i]) * 0.5 : ch0[i];
          if (v < lo) lo = v;
          if (v > hi) hi = v;
        }
        out[b * 2] = lo;
        out[b * 2 + 1] = hi;
      }
      return { peaks: out, rate: n / audio.duration, duration: audio.duration };
    });
    p.catch(() => peaks.delete(key));
    peaks.set(key, p);
  }
  return peaks.get(key);
}

export function forgetTake(path) {
  buffers.delete(path);
  peaks.delete(path);
}
