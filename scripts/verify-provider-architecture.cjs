const fs = require("fs");
const path = require("path");

const repoRoot = path.resolve(__dirname, "..");

const checks = [
  {
    file: "app/create-memory/page.tsx",
    forbidden: [
      "src/lib/supabase",
      "supabase.from",
      '.from("memories")',
      '.from(\"memories\")',
    ],
    required: ["CreateMemoryExperience"],
  },
  {
    file: "src/components/create-memory/CreateMemoryExperience.tsx",
    forbidden: ["src/lib/supabase", "supabase.from", '.from("memories")'],
    required: ["/api/memories", "/api/media/upload", "fetch", "createMemoryRequestHeaders"],
  },
  {
    file: "app/api/memories/route.ts",
    forbidden: ["MemorySupabaseDataSource", "supabase"],
    required: ["MemoryService", "MemoryRepository", "MemoryPostgresDataSource", "createMemory"],
  },
  {
    file: "app/api/memory-chat/route.ts",
    forbidden: [
      "DEEPSEEK_API_KEY",
      "OPENAI_API_KEY",
      "VOLC_API_KEY",
      "VOLC_BASE_URL",
      "ARK_MODEL_ID",
      "api.deepseek.com",
      "deepseek-chat",
      "new OpenAI",
      "chat.completions.create",
      "ChatSupabaseDataSource",
    ],
    required: ["MemoryEngineService", "ChatPostgresDataSource", "generateReply"],
  },
  {
    file: "app/api/tts/route.ts",
    forbidden: [
      "getAIProviderRegistry",
      "TTSAIProviderAdapter",
      "TENCENT_SECRET_ID",
      "TENCENT_SECRET_KEY",
      "tencentcloud-sdk-nodejs-tts",
      "TextToVoice",
      "VOLCENGINE_TTS_APP_ID",
      "VOLCENGINE_TTS_ACCESS_TOKEN",
      "openspeech.bytedance.com",
    ],
    required: ["legacyMutationUnavailable"],
  },
  {
    file: "services/tts/tencent-tts-provider.ts",
    forbidden: ["VOLCENGINE_TTS_APP_ID", "VOLCENGINE_TTS_ACCESS_TOKEN", "openspeech.bytedance.com"],
    required: ["tencentcloud-sdk-nodejs-tts", "TextToVoice", "TTSProvider"],
  },
];

let failed = false;

for (const check of checks) {
  const fullPath = path.join(repoRoot, check.file);
  const content = fs.readFileSync(fullPath, "utf8");

  for (const needle of check.forbidden) {
    if (content.includes(needle)) {
      console.error(`[FAIL] ${check.file} contains forbidden text: ${needle}`);
      failed = true;
    }
  }

  for (const needle of check.required) {
    if (!content.includes(needle)) {
      console.error(`[FAIL] ${check.file} missing required text: ${needle}`);
      failed = true;
    }
  }
}

if (failed) {
  process.exit(1);
}

console.log("Provider architecture guard passed.");
