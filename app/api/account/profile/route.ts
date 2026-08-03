import { createAccountProfileHandlers } from "./_handler";

const handlers = createAccountProfileHandlers();

export const GET = handlers.GET;
export const PATCH = handlers.PATCH;
