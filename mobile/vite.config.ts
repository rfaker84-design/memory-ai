import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => ({
  plugins: [react()],
  build: { outDir: "dist", emptyOutDir: true },
  define: {
    __MOBILE_DEBUG_BUILD__: JSON.stringify(mode === "debug"),
  },
}));
