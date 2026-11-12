// Theme switching: CSS variables drive the DOM; canvases read the same variables via `palette`.
import { getCurrentWindow } from "@tauri-apps/api/window";

const KEYS = [
  "line",
  "text",
  "fader",
  "wave",
  "wave-rec",
  "meter-lo",
  "meter-mid",
  "meter-hi",
  "meter-lo-off",
  "meter-mid-off",
  "meter-hi-off",
];

/** Current theme colours for canvas drawing, refreshed by applyTheme(). */
export const palette = {};

function refreshPalette() {
  const css = getComputedStyle(document.documentElement);
  for (const k of KEYS) palette[k] = css.getPropertyValue(`--color-${k}`).trim();
}

export function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  refreshPalette();
  // Native title bar follows the app theme.
  getCurrentWindow()
    .setTheme(theme === "light" ? "light" : "dark")
    .catch(() => {});
}

refreshPalette();
