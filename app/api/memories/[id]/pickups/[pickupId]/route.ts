import { createConfirmedPickupHandlers } from "../_handlers";

const handlers = createConfirmedPickupHandlers();
export const PATCH = handlers.PATCH;
export const DELETE = handlers.DELETE;
