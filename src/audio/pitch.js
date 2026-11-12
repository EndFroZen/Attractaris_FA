// Pitch detection (YIN) and guitar tuning helpers.

export const STANDARD_TUNING = [
  { string: 6, name: "E", octave: 2, freq: 82.41 },
  { string: 5, name: "A", octave: 2, freq: 110.0 },
  { string: 4, name: "D", octave: 3, freq: 146.83 },
  { string: 3, name: "G", octave: 3, freq: 196.0 },
  { string: 2, name: "B", octave: 3, freq: 246.94 },
  { string: 1, name: "E", octave: 4, freq: 329.63 },
];

const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

/** YIN pitch detection. Returns Hz, or null when the signal is too quiet or not periodic. */
export function detectPitch(buf, sampleRate) {
  let rms = 0;
  for (const v of buf) rms += v * v;
  if (Math.sqrt(rms / buf.length) < 0.01) return null;

  const minLag = Math.floor(sampleRate / 1000); // highest pitch we look for
  const maxLag = Math.floor(sampleRate / 60); // lowest pitch we look for (below drop-C)
  // ~2.5 periods of the lowest note is enough; a fixed window keeps the cost bounded.
  const width = Math.min(buf.length - maxLag - 1, Math.ceil(sampleRate / 60) * 2.5);
  const d = new Float32Array(maxLag + 2); // cumulative-mean-normalised difference
  d[0] = 1;
  let running = 0;
  let tau = -1;
  // Compute lag by lag and stop at the first dip below the threshold once it starts rising again.
  // High strings resolve at small lags, so they cost a fraction of a full scan.
  for (let t = 1; t <= maxLag + 1; t++) {
    let sum = 0;
    for (let i = 0; i < width; i++) {
      const diff = buf[i] - buf[i + t];
      sum += diff * diff;
    }
    running += sum;
    d[t] = running ? (sum * t) / running : 1;
    if (tau < 0 && t - 1 >= minLag && d[t - 1] < 0.15 && d[t] >= d[t - 1]) {
      tau = t - 1;
      break;
    }
  }
  if (tau < 0) return null;
  const [a, b, c] = [d[tau - 1], d[tau], d[tau + 1]];
  const denom = a - 2 * b + c;
  const shift = denom ? (a - c) / (2 * denom) : 0;
  return sampleRate / (tau + shift);
}

export function nearestNote(freq) {
  const midi = Math.round(69 + 12 * Math.log2(freq / 440));
  return {
    name: NOTE_NAMES[((midi % 12) + 12) % 12],
    octave: Math.floor(midi / 12) - 1,
    freq: 440 * 2 ** ((midi - 69) / 12),
  };
}

export const centsBetween = (freq, target) => 1200 * Math.log2(freq / target);

export function median(arr) {
  const s = [...arr].sort((x, y) => x - y);
  return s[Math.floor(s.length / 2)];
}
