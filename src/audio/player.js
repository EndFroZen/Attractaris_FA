// Take playback through Web Audio (sample-accurate seek), with a DAW-style cursor.
//
// MediaRecorder WebM files carry no duration/cues, so <audio> seeking is unreliable.
// Playing the decoded AudioBuffer from an offset makes seek instant and exact.
import { engine } from "./engine.js";
import { takeBuffer } from "./waveform.js";

class Player {
  // playingId is set as soon as play() is requested (also while the file decodes),
  // so a second press or Stop during loading is handled as "stop".
  // cursor/cursorTakeId: where playback starts, and which take that position belongs to.
  state = { playingId: null, cursor: 0, cursorTakeId: null };
  #listeners = new Set();
  #ctx = null;
  #sinkId = null;
  #src = null;
  #buffer = null;
  #startedAt = 0; // ctx time when the current source started
  #offset = 0; // take time at which the current source started
  #token = 0; // bumps on every play/stop; a load that finishes after a newer request discards itself

  subscribe = (fn) => {
    this.#listeners.add(fn);
    return () => this.#listeners.delete(fn);
  };
  getState = () => this.state;
  #set(patch) {
    this.state = { ...this.state, ...patch };
    this.#listeners.forEach((fn) => fn());
  }

  async #context() {
    this.#ctx ??= new AudioContext({ latencyHint: "playback" });
    await this.applyOutput();
    if (this.#ctx.state === "suspended") await this.#ctx.resume();
    return this.#ctx;
  }

  /** Route playback to the output device chosen in settings. */
  async applyOutput() {
    const ctx = this.#ctx;
    const sinkId = engine.settings.outputId;
    if (!ctx || typeof ctx.setSinkId !== "function" || sinkId === this.#sinkId) return;
    await ctx.setSinkId(sinkId);
    this.#sinkId = sinkId;
  }

  async play(take) {
    if (engine.isRecordBusy()) throw new Error("กำลังอัดอยู่ หยุดอัดก่อนเล่นเทค");
    this.stop();
    const token = ++this.#token;
    this.#set({ playingId: take.id });
    try {
      const buffer = await takeBuffer(take);
      const ctx = await this.#context();
      if (token !== this.#token) return;
      const { cursor, cursorTakeId } = this.state;
      let from = cursorTakeId === take.id ? cursor : 0;
      if (from >= buffer.duration - 0.05) from = 0; // at the end: start over
      this.#buffer = buffer;
      this.#start(from);
    } catch (err) {
      if (token === this.#token) this.stop();
      throw err;
    }
  }

  #start(from) {
    const ctx = this.#ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.#buffer;
    src.connect(ctx.destination);
    src.onended = () => {
      if (this.#src !== src) return; // replaced by a seek or stopped manually
      this.#src = null;
      this.#set({ playingId: null, cursor: 0 }); // reached the end: next play starts from the top
    };
    src.start(0, from);
    this.#src = src;
    this.#startedAt = ctx.currentTime;
    this.#offset = from;
  }

  #halt() {
    const src = this.#src;
    this.#src = null;
    if (src) {
      src.onended = null;
      try {
        src.stop();
      } catch {
        /* already stopped */
      }
    }
  }

  stop() {
    this.#token++;
    if (this.#src) {
      const pos = this.position();
      this.#halt();
      this.#set({ playingId: null, cursor: pos, cursorTakeId: this.state.playingId });
    } else if (this.state.playingId != null) {
      this.#set({ playingId: null });
    }
  }

  /** Move the cursor; if that take is playing, jump there immediately. */
  seek(sec, takeId) {
    const t = Math.max(0, sec);
    if (this.#src && this.state.playingId === takeId) {
      this.#halt();
      this.#start(Math.min(t, this.#buffer.duration));
    }
    this.#set({ cursor: t, cursorTakeId: takeId });
  }

  /** Current play position, or the cursor when stopped (seconds). */
  position() {
    if (this.#src) {
      const t = this.#offset + (this.#ctx.currentTime - this.#startedAt);
      return Math.min(t, this.#buffer.duration);
    }
    return this.state.cursor;
  }

  /** Position for a specific take (0 if the cursor belongs to another take). */
  positionFor(takeId) {
    if (this.#src && this.state.playingId === takeId) return this.position();
    return this.state.cursorTakeId === takeId ? this.state.cursor : 0;
  }
}

export const player = new Player();
