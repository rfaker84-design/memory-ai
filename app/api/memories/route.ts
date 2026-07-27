import { createMemoriesHandlers } from "./_handlers";
import { resolveSessionOwner } from "./_session-user-boundary";

const handlers = createMemoriesHandlers(undefined, undefined, resolveSessionOwner);

export const GET = handlers.GET;
export const POST = handlers.POST;
