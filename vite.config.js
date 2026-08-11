import { defineConfig } from "vite";

export default defineConfig({
  root: "examples",
  build: {
    outDir: "../docs",
    emptyOutDir: true,
  },
});
