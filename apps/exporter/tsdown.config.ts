import { defineConfig } from "tsdown";

export default defineConfig({
  clean: true,
  entry: ["src/server.ts"],
  format: "esm",
  outDir: "dist",
  platform: "node",
  sourcemap: true,
  target: "node24",
});
