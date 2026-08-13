import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

const rootDir = fileURLToPath(new URL(".", import.meta.url));
const releaseBuild = process.env.LEXITRACE_RELEASE === "true";

export default defineConfig({
  publicDir: false,
  build: {
    outDir: "dist",
    emptyOutDir: false,
    sourcemap: !releaseBuild,
    lib: {
      entry: resolve(rootDir, "src/background/service-worker.ts"),
      formats: ["es"],
      fileName: () => "scripts/background.js"
    }
  }
});
