// AudioWorklet that captures raw mono PCM for WAV recording.
// Batches 128-frame render quanta into ~4096-frame chunks to keep message traffic low.
const CHUNK = 4096;

class PcmRecorder extends AudioWorkletProcessor {
  constructor() {
    super();
    this.recording = false;
    this.buf = new Float32Array(CHUNK);
    this.len = 0;
    this.port.onmessage = (e) => {
      if (e.data === "start") {
        this.len = 0;
        this.recording = true;
      } else if (e.data === "stop") {
        this.recording = false;
        if (this.len) this.port.postMessage(this.buf.slice(0, this.len));
        this.len = 0;
        this.port.postMessage("done");
      }
    };
  }

  process(inputs) {
    const ch = inputs[0]?.[0];
    if (this.recording && ch) {
      let i = 0;
      while (i < ch.length) {
        const n = Math.min(ch.length - i, CHUNK - this.len);
        this.buf.set(ch.subarray(i, i + n), this.len);
        this.len += n;
        i += n;
        if (this.len === CHUNK) {
          this.port.postMessage(this.buf.slice());
          this.len = 0;
        }
      }
    }
    return true;
  }
}

registerProcessor("pcm-recorder", PcmRecorder);
