import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// https://v2.tauri.app/start/frontend/vite/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  clearScreen: false,
  build: {
    // Keep the AudioWorklet as a real file: audioWorklet.addModule() should load a URL, not an inlined data: URI.
    assetsInlineLimit: (file) => (file.endsWith("-worklet.js") ? false : undefined),
  },
  server: {
    port: 1420,
    strictPort: true,
    watch: { ignored: ["**/src-tauri/**"] },
  },
});
