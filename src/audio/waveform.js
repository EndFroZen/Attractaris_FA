// Waveform peaks: decode a take once, reduce to min/max buckets, cache by path.
import { recordingBlob } from "../db.js";
import { palette } from "../theme.js";

const cache = new Map();
const BUCKETS = 2000;

export function takePeaks(take) {
  const key = take.path;
  if (!cache.has(key)) {
    cache.set(
      key,
      (async () => {
        const blob = take.blob ?? (await recordingBlob(take));
        const ctx = new OfflineAudioContext(1, 1, 48000);
        const audio = await ctx.decodeAudioData(await blob.arrayBuffer());
        const data = audio.getChannelData(0);
        const n = Math.min(BUCKETS, data.length);
        const per = data.length / n;
        const peaks = new Float32Array(n * 2);
        for (let b = 0; b < n; b++) {
          let lo = 0;
          let hi = 0;
          const end = Math.floor((b + 1) * per);
          for (let i = Math.floor(b * per); i < end; i++) {
            const v = data[i];
            if (v < lo) lo = v;
            if (v > hi) hi = v;
          }
          peaks[b * 2] = lo;
          peaks[b * 2 + 1] = hi;
        }
        return { peaks, duration: audio.duration };
      })().catch((err) => {
        cache.delete(key);
        throw err;
      })
    );
  }
  return cache.get(key);
}

export function forgetPeaks(path) {
  cache.delete(path);
}

/**
 * Draws min/max pairs (flat array [lo0, hi0, lo1, hi1, …]) across `width` CSS pixels.
 * `fill` is the fraction of the width the data should occupy (for a growing live take).
 */
export function drawPeaks(canvas, peaks, { color, fill = 1 }) {
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
  }
  const g = canvas.getContext("2d");
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, w, h);
  const mid = h / 2;
  g.fillStyle = palette.line;
  g.fillRect(0, Math.round(mid), w, 1);
  const n = peaks.length / 2;
  if (!n) return;
  const cols = Math.max(1, Math.floor(w * fill));
  g.fillStyle = color;
  for (let x = 0; x < cols; x++) {
    const a = Math.floor((x / cols) * n);
    const b = Math.max(a + 1, Math.floor(((x + 1) / cols) * n));
    let lo = 0;
    let hi = 0;
    for (let i = a; i < b && i < n; i++) {
      if (peaks[i * 2] < lo) lo = peaks[i * 2];
      if (peaks[i * 2 + 1] > hi) hi = peaks[i * 2 + 1];
    }
    const top = mid - hi * mid * 0.95;
    const bot = mid - lo * mid * 0.95;
    g.fillRect(x, top, 1, Math.max(1, bot - top));
  }
}
