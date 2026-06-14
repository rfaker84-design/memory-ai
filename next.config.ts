import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Standalone output for PM2 deployment
  output: "standalone",
  // Increase serverless function timeout for AI/TTS calls
  serverExternalPackages: ["tencentcloud-sdk-nodejs-tts", "tencentcloud-sdk-nodejs-asr"],
};

export default nextConfig;