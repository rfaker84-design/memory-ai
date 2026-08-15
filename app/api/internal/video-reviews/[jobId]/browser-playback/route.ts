import { createVideoReviewBrowserPlaybackHandler } from "./_handler";

export const runtime = "nodejs";

const handler = createVideoReviewBrowserPlaybackHandler();

export const GET = handler.GET;
