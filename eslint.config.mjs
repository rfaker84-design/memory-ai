import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

const eslintConfig = [
  // Ignore experimental V6-V10 routes and components (not part of V3 SaaS core)
  {
    ignores: [
      "app/api/collective-analysis/**",
      "app/api/consciousness-convergence/**",
      "app/api/consciousness-state/**",
      "app/api/global-memory-graph/**",
      "app/api/memory-chat/**",
      "app/api/memory-civilizations/**",
      "app/api/memory-dialogue/**",
      "app/api/memory-ecosystem/**",
      "app/api/memory-graph/**",
      "app/api/memory-fusion/**",
      "app/api/memory-multi-universe/**",
      "app/api/memory-opening/**",
      "app/api/memory-personality/**",
      "app/api/memory-fragment-generate/**",
      "app/api/entity-state/**",
      "app/api/health/**",
      "app/api/daily-pulse/**",
      "app/components/splash-v3/**",
      "app/components/splash-v4/**",
      "app/components/splash-v5/**",
      "app/components/splash-v6/**",
      "app/components/splash-v7/**",
      "app/components/splash-v8/**",
      "app/components/splash-v9/**",
      "app/components/splash-v10/**",
      "app/consciousness/**",
      "app/infinite/**",
      "app/ontology/**",
      "app/mind/**",
      "app/living-memory/**",
      "app/heirloom/**",
      "app/timeline/**",
       // The remaining V3 visual archive is not imported by the current app shell.
       "src/components/splash-v3/**",
      // One-off source generator; its template is not application code.
      "src/components/write-splash.js",
      // Unreferenced V8 simulation preserved as an archived legacy artifact.
      "src/lib/consciousness-types.ts",
    ],
  },
  ...compat.extends("next/core-web-vitals", "next/typescript"),
];

export default eslintConfig;
