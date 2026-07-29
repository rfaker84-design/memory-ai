import { createFirstPresencePlaybackReadHandler } from "./_handler";

export const runtime = "nodejs";

const handler = createFirstPresencePlaybackReadHandler();

export const GET = handler.GET;
