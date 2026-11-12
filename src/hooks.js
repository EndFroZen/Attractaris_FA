import { useEffect, useRef, useSyncExternalStore } from "react";
import { engine, listDevices } from "./audio/engine.js";
import { player } from "./audio/player.js";

export const useEngineState = () => useSyncExternalStore(engine.subscribe, engine.getState);
export const usePlayerState = () => useSyncExternalStore(player.subscribe, player.getState);

// ---- audio devices: one shared store, so every panel shows the same list from a single enumeration ----
let devices = { inputs: [], outputs: [] };
const deviceListeners = new Set();
let refreshing = null;

export function refreshDevices() {
  refreshing ??= listDevices()
    .then((d) => {
      devices = d;
      deviceListeners.forEach((fn) => fn());
    })
    .catch(() => {})
    .finally(() => (refreshing = null));
  return refreshing;
}

const subscribeDevices = (fn) => {
  deviceListeners.add(fn);
  return () => deviceListeners.delete(fn);
};

// Refresh on hot-plug, and when the input opens (device labels only appear after mic permission).
navigator.mediaDevices?.addEventListener("devicechange", refreshDevices);
let wasOpen = false;
engine.subscribe(() => {
  if (engine.state.open && !wasOpen) refreshDevices();
  wasOpen = engine.state.open;
});
refreshDevices();

export function useDevices() {
  const list = useSyncExternalStore(subscribeDevices, () => devices);
  return { ...list, refresh: refreshDevices };
}

/** Calls fn every animation frame while mounted. */
export function useAnimationFrame(fn) {
  const ref = useRef(fn);
  ref.current = fn;
  useEffect(() => {
    let id;
    const tick = () => {
      ref.current();
      id = requestAnimationFrame(tick);
    };
    id = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(id);
  }, []);
}

/** m:ss */
export function formatDuration(ms) {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** mm:ss.mmm for the transport LCD. */
export function formatClock(sec) {
  const ms = Math.max(0, Math.floor(sec * 1000));
  const m = Math.floor(ms / 60000);
  const s = Math.floor(ms / 1000) % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${String(ms % 1000).padStart(3, "0")}`;
}

export const toDb = (gain) => (gain <= 0.00001 ? -Infinity : 20 * Math.log10(gain));
export const fromDb = (db) => (db === -Infinity ? 0 : 10 ** (db / 20));
export const formatDb = (db) => (db === -Infinity ? "-∞" : `${db > 0 ? "+" : ""}${db.toFixed(1)}`);
