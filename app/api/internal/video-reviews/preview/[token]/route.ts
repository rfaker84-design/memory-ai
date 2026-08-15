import { createVideoReviewPreviewReadHandler } from "./_handler";

export const runtime = "nodejs";

const handler = createVideoReviewPreviewReadHandler();

export const GET = handler.GET;
export const HEAD = handler.HEAD;
