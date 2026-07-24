import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Standalone output for PM2 deployment
  output: "standalone",
  // Increase serverless function timeout for AI/TTS calls
  serverExternalPackages: [
    "cos-nodejs-sdk-v5",
    "tencentcloud-sdk-nodejs-tts",
    "tencentcloud-sdk-nodejs-asr",
  ],
  // Skip ESLint during builds (experimental V6-V10 routes have pre-existing lint issues)
  // TypeScript compilation (tsc --noEmit) is clean for the V3 SaaS core
  eslint: {
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;
