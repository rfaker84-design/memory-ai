import { NextResponse } from "next/server";

import { FirstPresenceUncertainReconciliationService, FirstPresenceVideoPostgresRepository } from "@/features/video";

import { createVideoReconciliationHandler } from "./_handler";

export const POST = createVideoReconciliationHandler(
  () => new FirstPresenceUncertainReconciliationService(new FirstPresenceVideoPostgresRepository()),
);

export const GET = () => NextResponse.json({ error: "METHOD_NOT_ALLOWED" }, { status: 405 });
