import { createNotificationPreferencesHandlers } from "./_handler";

const handlers = createNotificationPreferencesHandlers();

export const GET = handlers.GET;
export const PATCH = handlers.PATCH;
