// Builds the MCP widget into ONE self-contained HTML file (widget/dist/index.html).
// Owned by the MCP package after the foundation lands. Run from the repo root: pnpm widget:build.
import { resolve } from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { viteSingleFile } from "vite-plugin-singlefile";

const root = resolve(process.cwd(), "widget");

export default defineConfig({
  root,
  plugins: [react(), viteSingleFile()],
  resolve: {
    alias: { "@lp/template": resolve(process.cwd(), "src/lib/template") },
  },
  build: {
    outDir: resolve(root, "dist"),
    emptyOutDir: true,
    target: "es2020",
    cssCodeSplit: false,
    assetsInlineLimit: 100_000_000,
    reportCompressedSize: false,
  },
});
