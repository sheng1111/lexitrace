import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

const rootDir = fileURLToPath(new URL(".", import.meta.url));
const releaseBuild = process.env.LEXITRACE_RELEASE === "true";

export default defineConfig({
  build: {
    outDir: "dist",
    emptyOutDir: true,
    sourcemap: !releaseBuild,
    rollupOptions: {
      input: {
        options: resolve(rootDir, "options/index.html"),
        popup: resolve(rootDir, "popup/index.html")
      },
      output: {
        chunkFileNames: "scripts/chunks/[name]-[hash].js",
        assetFileNames: "assets/[name][extname]"
      }
    }
  }
});
