import { createVideoReviewBrowserSessionHandler } from "./_handler";

export const runtime = "nodejs";

const handler = createVideoReviewBrowserSessionHandler();

export const GET = handler.GET;
