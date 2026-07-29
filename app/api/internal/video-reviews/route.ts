import { NextResponse } from "next/server";

import { createFirstPresenceVideoRuntime } from "@/features/video";

import { createVideoReviewsHandler } from "./_handler";

export const POST = createVideoReviewsHandler(createFirstPresenceVideoRuntime);

export const GET = () =>
  NextResponse.json({ error: "METHOD_NOT_ALLOWED" }, { status: 405 });
