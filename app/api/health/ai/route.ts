import { getAIProviderRegistry } from "../../../../services/ai/global-ai-registry";
import { AIProviderType } from "../../../../services/ai/provider-types";

const NO_STORE = { "Cache-Control": "no-store" };

export async function GET() {
  try {
    const registry = getAIProviderRegistry();
    const llmReady = Boolean(registry.get(
      AIProviderType.LLM,
      process.env.LLM_PROVIDER || "mock",
    ));
    const ttsReady = Boolean(registry.get(
      AIProviderType.TTS,
      process.env.TTS_PROVIDER || "mock",
    ));
    const healthy = llmReady && ttsReady;

    return Response.json(
      { status: healthy ? "ok" : "unavailable" },
      { status: healthy ? 200 : 503, headers: NO_STORE },
    );
  } catch {
    return Response.json(
      { status: "unavailable" },
      { status: 503, headers: NO_STORE },
    );
  }
}
