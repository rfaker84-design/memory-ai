// GET /api/share/content — 获取AI生成的分享内容
import { NextRequest, NextResponse } from "next/server";
import { verifySession } from "../../../../src/lib/auth";
import { generateShareContent } from "../../../../src/lib/shareContent";
import { generateViralTitle } from "../../../../src/lib/shareContent";
import { generateOGTags, generateShareCard, generateShareUrl, optimizeForPlatform } from "../../../../src/lib/socialOptimizer";
import type { Emotion } from "../../../../src/lib/volc";
import type { Platform } from "../../../../src/lib/socialOptimizer";

export async function GET(req: NextRequest) {
  const token = (req.headers.get("authorization") || "").replace("Bearer ", "");
  const session = verifySession(token);
  if (!session) return NextResponse.json({ error: "请先登录" }, { status: 401 });

  const name = req.nextUrl.searchParams.get("name") || "TA";
  const relationship = req.nextUrl.searchParams.get("relationship") || "";
  const emotion = (req.nextUrl.searchParams.get("emotion") || "calm") as Emotion;
  const format = (req.nextUrl.searchParams.get("format") || "card") as "card" | "quote" | "story" | "report";
  const platform = (req.nextUrl.searchParams.get("platform") || "wechat") as Platform;
  const memoryId = req.nextUrl.searchParams.get("memoryId") || "";

  const content = generateShareContent({ name, relationship, emotion, format });
  const optimized = optimizeForPlatform(platform, { title: content.title, description: content.subtitle, hashtags: content.hashtags });
  const viralTitle = generateViralTitle({ name, emotion });
  const ogTags = generateOGTags({
    title: content.title,
    description: content.subtitle,
    imageUrl: "/og/default.png",
    pageUrl: generateShareUrl(memoryId, session.userId, platform, "A"),
  });
  const card = generateShareCard({ platform, title: content.title, subtitle: content.subtitle, emotion });

  return NextResponse.json({
    content,
    optimized,
    viralTitle,
    ogTags,
    card,
    shareUrl: generateShareUrl(memoryId, session.userId, platform, "A"),
  });
}
