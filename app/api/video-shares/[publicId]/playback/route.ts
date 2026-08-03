import { createPublicVideoSharePlaybackHandler } from "./_handler";

export const runtime = "nodejs";
const handler = createPublicVideoSharePlaybackHandler();
export const GET = handler.GET;
