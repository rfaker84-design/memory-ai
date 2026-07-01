import { NextRequest, NextResponse } from "next/server";

import {
  ChatRepository,
  ChatService,
  ChatSupabaseDataSource,
} from "../../../features/chat";

const createChatService = () => {
  const dataSource = new ChatSupabaseDataSource();
  const repository = new ChatRepository(dataSource);

  return new ChatService(repository);
};

export async function GET(req: NextRequest) {
  const url = req.nextUrl;
  const userId = url.searchParams.get("userId");

  if (!userId) {
    return NextResponse.json({ error: "Missing userId" }, { status: 400 });
  }

  try {
    const chatService = createChatService();
    const conversations = await chatService.listConversations(userId);

    return NextResponse.json(conversations);
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

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { userId, memoryId, title } = body;

    if (!userId || !memoryId) {
      return NextResponse.json(
        { error: "Missing userId or memoryId" },
        { status: 400 }
      );
    }

    const chatService = createChatService();
    const conversation = await chatService.createConversation({
      userId,
      memoryId,
      title,
    });

    return NextResponse.json(conversation);
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
