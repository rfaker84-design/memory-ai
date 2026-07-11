import { NextRequest, NextResponse } from "next/server";

import {
  ChatRepository,
  ChatService,
  ChatPostgresDataSource,
} from "../../../../../features/chat";

const createChatService = () => {
  const dataSource = new ChatPostgresDataSource();
  const repository = new ChatRepository(dataSource);

  return new ChatService(repository);
};

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: memoryId } = await params;

  try {
    const body = await _req.json();
    const { userId } = body;

    if (!userId) {
      return NextResponse.json(
        { error: "Missing userId" },
        { status: 400 }
      );
    }

    const chatService = createChatService();
    const session = await chatService.getOrCreateConversationByMemory(
      userId,
      memoryId
    );

    return NextResponse.json({ session });
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

