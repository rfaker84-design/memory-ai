import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

import { resolveMobileSessionContract } from "./build/session-origin";

export default defineConfig(({ mode }) => {
  const channel = mode === "debug" ? "debug" : "release";
  const sessionContract = resolveMobileSessionContract(channel, process.env);
  return {
    plugins: [react()],
    build: { outDir: "dist", emptyOutDir: true },
    define: {
      __MOBILE_DEBUG_BUILD__: JSON.stringify(channel === "debug"),
      __MOBILE_APP_ORIGIN__: JSON.stringify(sessionContract.appOrigin),
    },
  };
});
