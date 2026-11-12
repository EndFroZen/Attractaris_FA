// Minimal WAV (RIFF) encoder: mono, 24-bit integer PCM.

const BITS = 24;

/** Encodes Float32 chunks (-1..1) into a mono 24-bit PCM WAV Blob. */
export function encodeWav(chunks, sampleRate) {
  const frames = chunks.reduce((n, c) => n + c.length, 0);
  const bytesPerSample = BITS / 8;
  const dataSize = frames * bytesPerSample;
  const buf = new ArrayBuffer(44 + dataSize);
  const v = new DataView(buf);
  const str = (off, s) => [...s].forEach((ch, i) => v.setUint8(off + i, ch.charCodeAt(0)));

  str(0, "RIFF");
  v.setUint32(4, 36 + dataSize, true);
  str(8, "WAVE");
  str(12, "fmt ");
  v.setUint32(16, 16, true); // fmt chunk size
  v.setUint16(20, 1, true); // PCM
  v.setUint16(22, 1, true); // mono
  v.setUint32(24, sampleRate, true);
  v.setUint32(28, sampleRate * bytesPerSample, true); // byte rate
  v.setUint16(32, bytesPerSample, true); // block align
  v.setUint16(34, BITS, true);
  str(36, "data");
  v.setUint32(40, dataSize, true);

  const out = new Uint8Array(buf);
  let off = 44;
  for (const c of chunks) {
    for (let i = 0; i < c.length; i++) {
      const s = Math.max(-1, Math.min(1, c[i]));
      const n = Math.round(s < 0 ? s * 0x800000 : s * 0x7fffff);
      out[off] = n & 0xff;
      out[off + 1] = (n >> 8) & 0xff;
      out[off + 2] = (n >> 16) & 0xff;
      off += 3;
    }
  }
  return new Blob([buf], { type: "audio/wav" });
}
