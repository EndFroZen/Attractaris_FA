// Single-take playback with a readable position, shared by the transport, lane and pool.
import { engine } from "./engine.js";
import { recordingBlob } from "../db.js";

class Player {
  // playingId is set as soon as play() is requested (also while the file loads),
  // so a second press or Stop during loading is handled as "stop".
  state = { playingId: null };
  #listeners = new Set();
  #el = null;
  #url = null;
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

  async play(take) {
    if (engine.isRecordBusy()) throw new Error("กำลังอัดอยู่ หยุดอัดก่อนเล่นเทค");
    this.stop();
    const token = ++this.#token;
    this.#set({ playingId: take.id });
    let url = null;
    try {
      const blob = take.blob ?? (await recordingBlob(take));
      if (token !== this.#token) return;
      url = URL.createObjectURL(blob);
      const el = new Audio(url);
      await engine.setOutputFor(el);
      if (token !== this.#token) return URL.revokeObjectURL(url);
      el.onended = () => token === this.#token && this.stop();
      this.#el = el;
      this.#url = url;
      await el.play();
    } catch (err) {
      if (url && url !== this.#url) URL.revokeObjectURL(url);
      if (token === this.#token) this.stop();
      throw err;
    }
  }

  stop() {
    this.#token++;
    if (this.#el) {
      this.#el.pause();
      this.#el = null;
    }
    if (this.#url) {
      URL.revokeObjectURL(this.#url);
      this.#url = null;
    }
    if (this.state.playingId != null) this.#set({ playingId: null });
  }

  /** Playback position in seconds (0 when stopped or still loading). */
  position() {
    return this.#el ? this.#el.currentTime : 0;
  }
}

export const player = new Player();
