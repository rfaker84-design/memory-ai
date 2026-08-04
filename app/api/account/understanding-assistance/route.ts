import { createUnderstandingAssistanceHandler } from "./_handler";

const handlers = createUnderstandingAssistanceHandler();

export const GET = handlers.GET;
export const POST = handlers.POST;
export const DELETE = handlers.DELETE;

