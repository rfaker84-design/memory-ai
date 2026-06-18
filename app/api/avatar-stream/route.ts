// API: Avatar WebRTC stream endpoint
// Returns signaling info for Tencent Digital Human WebRTC connection
// In production: proxies to Tencent Cloud Digital Human API
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const { memoryId, emotion } = await req.json();
    if (!memoryId) return NextResponse.json({ error: "missing memoryId" }, { status: 400 });

    // In production: call Tencent Cloud Digital Human StartStream API
    // Returns WebRTC SDP offer + ICE candidates
    // For MVP: return a simulated stream URL

    const avatarProvider = process.env.AVATAR_PROVIDER || "adapter_v1";

    if (avatarProvider === "tencent_zhiying") {
      // TODO: Tencent Cloud Digital Human WebRTC API
      // POST https://ivh.tencentcloudapi.com/ to get stream URL
      return NextResponse.json({
        streamType: "webrtc",
        offerSdp: null, // populated by actual API
        iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
        streamUrl: null,
        sessionId: "session_" + Date.now(),
        emotion: emotion || "calm",
      });
    }

    // Adapter fallback: return a simulated stream config
    return NextResponse.json({
      streamType: "simulated",
      streamUrl: null,
      sessionId: "session_" + Date.now(),
      emotion: emotion || "calm",
      config: {
        // These drive the simulated avatar rendering
        faceType: "realistic",
        emotion: emotion || "calm",
        speakingEnabled: true,
        gazeTracking: true,
      },
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "stream failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
