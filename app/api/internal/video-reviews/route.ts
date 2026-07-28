import { NextResponse } from "next/server";

import { createVideoReviewsHandler } from "./_handler";

export const POST = createVideoReviewsHandler(() => {
  throw new Error("VIDEO_REVIEW_SERVICE_NOT_WIRED");
});

export const GET = () =>
  NextResponse.json({ error: "METHOD_NOT_ALLOWED" }, { status: 405 });
