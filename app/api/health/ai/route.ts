const SUPPORTED_LLM_PROVIDERS = ["mock", "openai"] as const;

export async function GET() {
  try {
    const provider = process.env.LLM_PROVIDER || "mock";
    const providerSupported = SUPPORTED_LLM_PROVIDERS.includes(
      provider as (typeof SUPPORTED_LLM_PROVIDERS)[number]
    );

    if (!providerSupported) {
      return Response.json(
        {
          status: "error",
          provider,
          hasOpenAIKey: Boolean(process.env.OPENAI_API_KEY),
          message: "Unsupported LLM_PROVIDER",
        },
        { status: 500 }
      );
    }

    return Response.json(
      {
        status: "ok",
        provider,
        hasOpenAIKey: Boolean(process.env.OPENAI_API_KEY),
      },
      { status: 200 }
    );
  } catch (error) {
    return Response.json(
      {
        status: "error",
        provider: process.env.LLM_PROVIDER || "mock",
        hasOpenAIKey: Boolean(process.env.OPENAI_API_KEY),
        message: error instanceof Error ? error.message : "Unknown AI health check error",
      },
      { status: 500 }
    );
  }
}
