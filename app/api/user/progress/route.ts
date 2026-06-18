// GET /api/user/progress — 当前用户成长进度
import { NextRequest, NextResponse } from "next/server";
import { verifySession } from "../../../../src/lib/auth";
import { getUserProgress } from "../../../../src/lib/userProgress";
import { getEngagementPhase } from "../../../../src/lib/engagementLoop";
import { getConversionProfile } from "../../../../src/lib/conversion";

export async function GET(req: NextRequest) {
  const token = (req.headers.get("authorization") || "").replace("Bearer ", "");
  const session = verifySession(token);
  if (!session) return NextResponse.json({ error: "请先登录" }, { status: 401 });

  const progress = getUserProgress(session.userId);
  const engagement = getEngagementPhase(session.userId);
  const conversion = getConversionProfile(session.userId);

  return NextResponse.json({
    progress,
    engagement: {
      phase: engagement.phase,
      loopCount: engagement.loopCount,
      returnRate: engagement.returnRate,
      predictedPhaseDays: engagement.predictedPhaseDays,
    },
    conversion: {
      stage: conversion.stage,
      probability: conversion.conversionProbability,
      urgency: conversion.urgency,
      recommendedTier: conversion.recommendedTier,
    },
  });
}
