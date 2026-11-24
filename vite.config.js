import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
export default defineConfig({
  base: "/workspace/",
  plugins: [react()],
  build: { outDir: "docs/workspace", emptyOutDir: true },
  server: { host: "0.0.0.0" },
});
