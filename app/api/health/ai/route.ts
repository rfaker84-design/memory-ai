import { getAIProviderRegistry } from "../../../../services/ai/global-ai-registry";
import { AIProviderType } from "../../../../services/ai/provider-types";
import {
  getConfiguredLLMProviderName,
  resolveFormalLLMProvider,
} from "../../../../services/llm/formal-llm-provider";

const NO_STORE = { "Cache-Control": "no-store" };

export async function GET() {
  const llmProvider = getConfiguredLLMProviderName();
  try {
    const registry = getAIProviderRegistry();
    resolveFormalLLMProvider();
    const llmReady = true;
    const ttsReady = Boolean(registry.get(
      AIProviderType.TTS,
      process.env.TTS_PROVIDER || "mock",
    ));
    const healthy = llmReady && ttsReady;

    return Response.json(
      { status: healthy ? "ok" : "unavailable", llmProvider },
      { status: healthy ? 200 : 503, headers: NO_STORE },
    );
  } catch {
    return Response.json(
      { status: "unavailable", llmProvider },
      { status: 503, headers: NO_STORE },
    );
  }
}
