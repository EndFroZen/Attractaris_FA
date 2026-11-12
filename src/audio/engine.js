// Audio engine: one shared input stream feeding live monitoring, recording, the level meter and the tuner.
//
//   input stream → splitter ─ ch0 → pick0 ┐
//                           └ ch1 → pick1 ┴→ mono ─→ monitorGain → output device
//                                                ├→ recDest (MediaRecorder)
//                                                ├→ meter analyser
//                                                └→ tuner analyser
// "mono" is upmixed to both ears, so a guitar on Input 1 is heard in both.

export const DEFAULT_SETTINGS = {
  inputId: "",
  outputId: "",
  channel: "0", // "0" = Input 1, "1" = Input 2, "mix"
  latency: "interactive", // "0" | "interactive" | "playback"
  volume: 1,
  theme: "dark", // UI only; stored with the rest of the settings
};

class AudioEngine {
  settings = { ...DEFAULT_SETTINGS };
  // errorId bumps on every failure, so the same message reported twice still notifies listeners.
  state = { open: false, monitoring: false, tuning: false, recording: false, latencyMs: 0, error: "", errorId: 0 };
  #listeners = new Set();
  #nodes = null;
  #openedWith = { inputId: null, latency: null }; // settings the current context was built with
  // Record lifecycle: "idle" → "starting" (input opening) → "recording" → "stopping" → "idle".
  #recPhase = "idle";
  #cancelStart = false;
  #recorder = null;
  #chunks = [];
  #recStartedAt = 0;
  #meterBuf = null;
  #tunerBuf = null;

  // ---- store plumbing for useSyncExternalStore ----
  subscribe = (fn) => {
    this.#listeners.add(fn);
    return () => this.#listeners.delete(fn);
  };
  getState = () => this.state;
  #set(patch) {
    this.state = { ...this.state, ...patch };
    this.#listeners.forEach((fn) => fn());
  }

  // ---- settings ----
  async updateSettings(patch) {
    this.settings = { ...this.settings, ...patch };
    if (!this.#nodes) {
      // An open in flight may have read the old values: wait for it, then apply on the live context.
      if (!this.#opening) return;
      await this.#opening.catch(() => {});
      if (!this.#nodes) return;
    }
    const n = this.#nodes;
    if ("channel" in patch) this.#applyChannel();
    if ("volume" in patch) this.#applyMonitorGain();
    if ("outputId" in patch) await this.#applySink(n.ctx);
    // Input device and latency are fixed for an open context: reopen when they differ from what it was built with.
    const { inputId, latency } = this.settings;
    if (this.#openedWith.inputId !== inputId || this.#openedWith.latency !== latency) await this.#reopen();
  }

  // ---- lifecycle ----
  // Concurrent callers share one in-flight open, so we never create two contexts.
  #opening = null;
  async #open() {
    if (this.#nodes) return this.#nodes;
    this.#opening ??= this.#doOpen().finally(() => (this.#opening = null));
    return this.#opening;
  }

  async #doOpen() {
    const { inputId, latency } = this.settings;
    if (this.state.error) this.#set({ error: "" });
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        // Speech processing squashes sustain and pumps the volume on instruments.
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
        channelCount: { ideal: 2 },
        ...(inputId && { deviceId: { exact: inputId } }),
      },
    });
    const ctx = new AudioContext({ latencyHint: latency === "0" ? 0 : latency });
    await this.#applySink(ctx);
    const source = ctx.createMediaStreamSource(stream);
    const splitter = ctx.createChannelSplitter(2);
    const pick0 = ctx.createGain();
    const pick1 = ctx.createGain();
    const mono = ctx.createGain();
    mono.channelCount = 1;
    mono.channelCountMode = "explicit";
    const monitorGain = ctx.createGain();
    monitorGain.gain.value = 0;
    const recDest = ctx.createMediaStreamDestination();
    const meter = ctx.createAnalyser();
    meter.fftSize = 1024;
    const tuner = ctx.createAnalyser();
    tuner.fftSize = 4096; // ~85 ms window: enough periods of low E (82 Hz)

    source.connect(splitter);
    splitter.connect(pick0, 0);
    splitter.connect(pick1, 1);
    pick0.connect(mono);
    pick1.connect(mono);
    mono.connect(monitorGain).connect(ctx.destination);
    mono.connect(recDest);
    mono.connect(meter);
    mono.connect(tuner);

    this.#nodes = { ctx, stream, pick0, pick1, monitorGain, recDest, meter, tuner };
    this.#openedWith = { inputId, latency };
    this.#meterBuf = new Float32Array(meter.fftSize);
    this.#tunerBuf = new Float32Array(tuner.fftSize);
    this.#applyChannel();
    this.#applyMonitorGain();
    this.#set({ open: true, error: "", latencyMs: this.#latency() });
    return this.#nodes;
  }

  #close() {
    const n = this.#nodes;
    if (!n) return;
    n.stream.getTracks().forEach((t) => t.stop());
    n.ctx.close();
    this.#nodes = null;
    this.#set({ open: false, latencyMs: 0 });
  }

  #closeIfIdle() {
    const { monitoring, tuning } = this.state;
    if (!monitoring && !tuning && this.#recPhase === "idle") this.#close();
  }

  async #reopen() {
    if (this.#recPhase !== "idle") return; // never interrupt a take; applies on next open
    this.#close();
    try {
      await this.#open();
    } catch (err) {
      this.#fail(err);
    }
  }

  #fail(err) {
    this.#want = { monitoring: false, tuning: false };
    if (this.#recPhase === "starting") this.#recPhase = "idle";
    if (this.#recPhase === "idle") this.#close();
    this.#reportError(err?.message || String(err));
    this.#set({ monitoring: false, tuning: false });
  }

  #reportError(message) {
    this.#set({ error: message, errorId: this.state.errorId + 1 });
  }

  #latency() {
    const c = this.#nodes?.ctx;
    return c ? Math.round(((c.baseLatency || 0) + (c.outputLatency || 0)) * 1000) : 0;
  }

  #applyChannel() {
    const n = this.#nodes;
    const ch = this.settings.channel;
    const [a, b] = ch === "mix" ? [0.5, 0.5] : ch === "1" ? [0, 1] : [1, 0];
    n.pick0.gain.value = a;
    n.pick1.gain.value = b;
  }

  #applyMonitorGain() {
    const n = this.#nodes;
    const target = this.state.monitoring ? Number(this.settings.volume) : 0;
    n.monitorGain.gain.setTargetAtTime(target, n.ctx.currentTime, 0.01);
  }

  async #applySink(target) {
    if (typeof target.setSinkId !== "function") return;
    try {
      await target.setSinkId(this.settings.outputId);
    } catch (err) {
      this.#reportError("เปลี่ยนอุปกรณ์เสียงออกไม่ได้: " + err.message);
    }
  }

  // ---- features ----
  // Latest requested on/off per feature: a later call can land while an earlier one is still opening the input.
  #want = { monitoring: false, tuning: false };

  async setMonitoring(on) {
    this.#want.monitoring = on;
    try {
      if (on) await this.#open();
      this.#set({ monitoring: this.#want.monitoring });
      if (this.#nodes) this.#applyMonitorGain();
      this.#closeIfIdle();
    } catch (err) {
      this.#fail(err);
    }
  }

  async setTuning(on) {
    this.#want.tuning = on;
    try {
      if (on) await this.#open();
      this.#set({ tuning: this.#want.tuning });
      this.#closeIfIdle();
    } catch (err) {
      this.#fail(err);
    }
  }

  /** True from the moment a take is requested until it has fully stopped. */
  isRecordBusy() {
    return this.#recPhase !== "idle";
  }

  async startRecording() {
    if (this.#recPhase !== "idle") return; // a second press while opening must not start a second recorder
    this.#recPhase = "starting";
    this.#cancelStart = false;
    try {
      const { recDest } = await this.#open();
      if (this.#cancelStart) {
        // Stop was pressed while the input was still opening.
        this.#recPhase = "idle";
        this.#closeIfIdle();
        return;
      }
      const chunks = [];
      const rec = new MediaRecorder(recDest.stream);
      rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
      this.#chunks = chunks;
      this.#recorder = rec;
      rec.start();
      this.#recStartedAt = performance.now();
      this.#recPhase = "recording";
      this.#set({ recording: true });
    } catch (err) {
      this.#fail(err);
    }
  }

  /** Stops the take and resolves with { blob, durationMs }, or null if nothing was recorded. */
  stopRecording() {
    if (this.#recPhase === "starting") {
      this.#cancelStart = true;
      return Promise.resolve(null);
    }
    const rec = this.#recorder;
    if (this.#recPhase !== "recording" || !rec) return Promise.resolve(null);
    this.#recPhase = "stopping";
    const chunks = this.#chunks;
    return new Promise((resolve) => {
      rec.onstop = () => {
        const blob = new Blob(chunks, { type: rec.mimeType });
        const durationMs = Math.round(performance.now() - this.#recStartedAt);
        this.#recorder = null;
        this.#recPhase = "idle";
        this.#set({ recording: false });
        this.#closeIfIdle();
        resolve({ blob, durationMs });
      };
      rec.stop();
    });
  }

  /** Peak level 0..1 of the selected input channel. */
  level() {
    const n = this.#nodes;
    if (!n) return 0;
    n.meter.getFloatTimeDomainData(this.#meterBuf);
    let peak = 0;
    for (const v of this.#meterBuf) peak = Math.max(peak, Math.abs(v));
    return Math.min(1, peak);
  }

  /** [min, max] sample of the current meter window, for drawing a live waveform. */
  minMax() {
    const n = this.#nodes;
    if (!n) return [0, 0];
    n.meter.getFloatTimeDomainData(this.#meterBuf);
    let lo = 0;
    let hi = 0;
    for (const v of this.#meterBuf) {
      if (v < lo) lo = v;
      if (v > hi) hi = v;
    }
    return [lo, hi];
  }

  /** Seconds since the current take started (0 when not recording). */
  recordingElapsed() {
    return this.state.recording ? (performance.now() - this.#recStartedAt) / 1000 : 0;
  }

  sampleRate() {
    return this.#nodes?.ctx.sampleRate ?? 0;
  }

  /** Time-domain samples for the tuner, or null when the input is closed. */
  tunerSamples() {
    const n = this.#nodes;
    if (!n) return null;
    n.tuner.getFloatTimeDomainData(this.#tunerBuf);
    return { buf: this.#tunerBuf, sampleRate: n.ctx.sampleRate };
  }

  async setOutputFor(el) {
    await this.#applySink(el);
  }
}

export const engine = new AudioEngine();

export async function listDevices() {
  const devices = await navigator.mediaDevices.enumerateDevices();
  const clean = (kind) =>
    devices
      .filter((d) => d.kind === kind && d.deviceId !== "default" && d.deviceId !== "communications")
      .map((d, i) => ({ id: d.deviceId, label: d.label || `${kind === "audioinput" ? "อินพุต" : "เอาต์พุต"} ${i + 1}` }));
  return { inputs: clean("audioinput"), outputs: clean("audiooutput") };
}
