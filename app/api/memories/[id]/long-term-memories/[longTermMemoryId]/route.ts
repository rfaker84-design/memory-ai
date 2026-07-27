import { createLongTermMemoryBetaHandlers } from "../_handlers";

const handlers = createLongTermMemoryBetaHandlers();

export const PATCH = handlers.PATCH;
export const DELETE = handlers.DELETE;
