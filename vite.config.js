import { defineConfig } from "vite";

export default defineConfig({
  root: "examples",
  build: {
    outDir: "../examples-dist",
    emptyOutDir: true,
  },
});
