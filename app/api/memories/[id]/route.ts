import { createMemoryItemHandlers } from "./_handlers";

const handlers = createMemoryItemHandlers();

export const GET = handlers.GET;
export const PATCH = handlers.PATCH;
export const DELETE = handlers.DELETE;
