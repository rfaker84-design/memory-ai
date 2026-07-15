import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { NextRequest } from "next/server";

import * as chatMvp from "./chat-mvp/route";
import * as chatSessions from "./chat-sessions/route";
import * as chatMessages from "./chat-sessions/[id]/messages/route";
import * as legacyChat from "./chat/route";
import * as memoriesMvp from "./memories-mvp/route";
import * as avatar from "./avatar/route";
import * as avatarCallback from "./avatar-callback/route";
import * as avatarGenerate from "./avatar-generate/route";
import * as avatarProvider from "./avatar-provider/route";
import * as avatarStream from "./avatar-stream/route";
import * as consciousnessConvergence from "./consciousness-convergence/route";
import * as dailyPulse from "./daily-pulse/route";
import * as jobs from "./jobs/route";
import * as jobItem from "./jobs/[id]/route";
import * as memoryCivilizations from "./memory-civilizations/route";
import * as memoryGraph from "./memory-graph/route";
import * as memoryRelations from "./memory-relations/route";
import * as notificationPush from "./notification/push/route";
import * as paymentTrigger from "./payment/trigger/route";
import * as projectState from "./project-state/route";
import * as shareContent from "./share/content/route";
import * as shareGenerate from "./share/generate/route";
import * as startAvatarGeneration from "./start-avatar-generation/route";
import * as startVoiceTraining from "./start-voice-training/route";
import * as subscriptionStatus from "./subscription/status/route";
import * as voiceClone from "./voice-clone/route";
import * as voiceCloneCallback from "./voice-clone-callback/route";
import * as websocket from "./ws/route";

process.env.AUTH_ALLOWED_ORIGIN = "https://memoryai.test";

const routes = [
  { name: "chat-sessions", route: chatSessions },
  { name: "chat-sessions messages", route: chatMessages },
  { name: "chat-mvp", route: chatMvp },
  { name: "memories-mvp", route: memoriesMvp },
  { name: "legacy chat", route: legacyChat },
];

const newlyClosedRoutes = [
  { name: "avatar", path: "avatar/route.ts", route: avatar },
  { name: "avatar-callback", path: "avatar-callback/route.ts", route: avatarCallback },
  { name: "avatar-generate", path: "avatar-generate/route.ts", route: avatarGenerate },
  { name: "avatar-provider", path: "avatar-provider/route.ts", route: avatarProvider },
  { name: "avatar-stream", path: "avatar-stream/route.ts", route: avatarStream },
  { name: "consciousness-convergence", path: "consciousness-convergence/route.ts", route: consciousnessConvergence },
  { name: "daily-pulse", path: "daily-pulse/route.ts", route: dailyPulse },
  { name: "jobs", path: "jobs/route.ts", route: jobs },
  { name: "jobs item", path: "jobs/[id]/route.ts", route: jobItem },
  { name: "memory-civilizations", path: "memory-civilizations/route.ts", route: memoryCivilizations },
  { name: "memory-graph", path: "memory-graph/route.ts", route: memoryGraph },
  { name: "memory-relations", path: "memory-relations/route.ts", route: memoryRelations },
  { name: "notification push", path: "notification/push/route.ts", route: notificationPush },
  { name: "payment trigger", path: "payment/trigger/route.ts", route: paymentTrigger },
  { name: "project-state", path: "project-state/route.ts", route: projectState },
  { name: "share content", path: "share/content/route.ts", route: shareContent },
  { name: "share generate", path: "share/generate/route.ts", route: shareGenerate },
  { name: "start-avatar-generation", path: "start-avatar-generation/route.ts", route: startAvatarGeneration },
  { name: "start-voice-training", path: "start-voice-training/route.ts", route: startVoiceTraining },
  { name: "subscription status", path: "subscription/status/route.ts", route: subscriptionStatus },
  { name: "voice-clone", path: "voice-clone/route.ts", route: voiceClone },
  { name: "voice-clone-callback", path: "voice-clone-callback/route.ts", route: voiceCloneCallback },
  { name: "ws", path: "ws/route.ts", route: websocket },
] as const;

test("legacy ownership routes cannot enumerate or mutate victim data", async (t) => {
  for (const entry of routes) {
    await t.test(entry.name, async () => {
      const read = await entry.route.GET();
      assert.equal(read.status, 410);
      assert.deepEqual(await read.json(), { error: "LEGACY_ROUTE_UNAVAILABLE" });

      const mutation = await entry.route.POST(new NextRequest(
        `https://memoryai.test/api/${entry.name}`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            origin: "https://memoryai.test",
          },
          body: JSON.stringify({
            userId: "victim-user-id",
            phone: "13800000000",
            user_phone: "13800000000",
          }),
        },
      ));
      assert.equal(mutation.status, 410);
      assert.deepEqual(await mutation.json(), { error: "LEGACY_ROUTE_UNAVAILABLE" });
    });
  }
});

test("legacy mutations still require the shared Origin boundary", async () => {
  const response = await chatSessions.POST(new NextRequest(
    "https://memoryai.test/api/chat-sessions",
    { method: "POST", body: JSON.stringify({ userId: "victim" }) },
  ));
  assert.equal(response.status, 403);
  assert.equal((await response.json()).error, "ORIGIN_NOT_ALLOWED");
});

test("all remaining client-owned legacy routes fail closed before side effects", async (t) => {
  for (const entry of newlyClosedRoutes) {
    await t.test(entry.name, async () => {
      if ("GET" in entry.route) {
        const response = await entry.route.GET();
        assert.equal(response.status, 410);
        assert.deepEqual(await response.json(), { error: "LEGACY_ROUTE_UNAVAILABLE" });
      }

      const mutationRoute = entry.route as Partial<Record<
        "POST" | "PATCH",
        (request: NextRequest) => Response
      >>;
      for (const method of ["POST", "PATCH"] as const) {
        const handler = mutationRoute[method];
        if (!handler) continue;
        const response = await handler(new NextRequest(
          `https://memoryai.test/api/${entry.name}`,
          {
            method,
            headers: { origin: "https://memoryai.test" },
            body: JSON.stringify({
              memory_id: "victim-memory",
              memoryId: "victim-memory",
              phone: "13800000000",
              user_phone: "13800000000",
              userId: "victim-user",
            }),
          },
        ));
        assert.equal(response.status, 410);
        assert.deepEqual(await response.json(), { error: "LEGACY_ROUTE_UNAVAILABLE" });
      }

      const source = readFileSync(new URL(entry.path, import.meta.url), "utf8");
      assert.doesNotMatch(source, /supabase|postgres|provider|openai|orchestrator/i);
      assert.match(source, /legacy(?:Route|Mutation)Unavailable/);
    });
  }
});
