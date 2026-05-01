import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

const rootDir = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  publicDir: false,
  build: {
    outDir: "dist",
    emptyOutDir: false,
    sourcemap: true,
    lib: {
      entry: resolve(rootDir, "src/content/content.ts"),
      name: "LexiTraceContent",
      formats: ["iife"],
      fileName: () => "scripts/content.js"
    }
  }
});
