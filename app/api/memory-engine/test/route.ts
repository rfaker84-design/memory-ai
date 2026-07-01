import { NextRequest, NextResponse } from "next/server";

import {
  MemoryEngineService,
  type MemoryEngineInput,
} from "../../../../features/memory-engine";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { userId, memoryId, sessionId, userMessage } =
      body as Partial<MemoryEngineInput>;

    if (!userId || !memoryId || !sessionId || !userMessage) {
      return NextResponse.json(
        { error: "Missing userId, memoryId, sessionId, or userMessage" },
        { status: 400 }
      );
    }

    const memoryEngine = new MemoryEngineService();
    const response = await memoryEngine.generateReply({
      userId,
      memoryId,
      sessionId,
      userMessage,
    });

    const provider = process.env.LLM_PROVIDER || "mock";

    return NextResponse.json({
      reply: response.content,
      provider,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Internal server error",
      },
      { status: 500 }
    );
  }
}
