import { createConfirmedPickupHandlers } from "./_handlers";

const handlers = createConfirmedPickupHandlers();
export const GET = handlers.GET;
export const POST = handlers.POST;
