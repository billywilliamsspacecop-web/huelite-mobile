import { defineConfig } from "vite";

// Relative base so the built files load from Capacitor's local file server.
export default defineConfig({
  base: "./",
  build: { target: "es2020", outDir: "dist" },
});
