import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

// Tauri expects a fixed dev port and ignores src-tauri in watch mode.
export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    watch: { ignored: ["**/src-tauri/**"] },
  },
  build: { target: "es2021", chunkSizeWarningLimit: 1200 },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
