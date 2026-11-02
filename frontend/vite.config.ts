import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  server: { port: 5173 }, // the backend's CORS_ORIGINS expects this port
  test: {
    // happy-dom, not jsdom: jsdom's AbortSignal breaks React Router navigation under Node's fetch
    environment: "happy-dom",
    globals: true,
    setupFiles: ["src/test-setup.ts"],
  },
});
