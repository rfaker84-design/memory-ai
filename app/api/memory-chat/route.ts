import { verifyRequestSession } from "../../../src/server/auth";
import { createMemoryChatHandler } from "./_handler";

export const POST = createMemoryChatHandler(
  undefined,
  undefined,
  undefined,
  verifyRequestSession
);
