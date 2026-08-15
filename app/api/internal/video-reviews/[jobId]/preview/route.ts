import { createVideoReviewPreviewAuthorizationHandler } from "./_handler";

export const runtime = "nodejs";

const handler = createVideoReviewPreviewAuthorizationHandler();

export const GET = handler.GET;
