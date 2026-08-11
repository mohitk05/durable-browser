import { defineConfig } from "vite";

export default defineConfig({
  root: "examples",
  base: "/durable-browser/",
  build: {
    outDir: "../docs",
    emptyOutDir: true,
  },
});
