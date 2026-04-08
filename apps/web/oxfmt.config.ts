import { defineConfig } from "oxfmt";

export default defineConfig({
  ignorePatterns: ["*.gen.ts"],
  sortImports: true,
  sortPackageJson: true,
  sortTailwindcssClasses: true,
});
