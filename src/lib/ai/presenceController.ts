// presenceController.ts — AI存在体统一控制器
// 这是整个系统唯一的AI入口。所有页面/API不得直接调用LLM/TTS/Avatar。
// 内部委托给 orchestrator（已包含缓存/计费/限流/熔断/降级）

import { orchestrate, type OrchestratorResponse } from "../orchestrator";
import { getEmotionState } from "../emotionEngine";
import type { Emotion } from "../volc";

// ─── 统一输出结构 ──────────────────────────────────────────
export interface PresenceResponse {
  text: string;
  emotion: Emotion;
  emotionIntensity: number;
  audioUrl: string | null;
  avatarUrl: string | null;
  memoryId: string;
  // 元信息（可选消费）
  cost: OrchestratorResponse["cost"];
  cacheHit: OrchestratorResponse["cacheHit"];
}

// ─── 统一入口：process ─────────────────────────────────────
// 所有Chat请求必须通过此函数，禁止绕过
export async function process(params: {
  userId: string;
  memoryId: string;
  name: string;
  userMessage: string;
  relationship?: string | null;
  lifeStory?: string | null;
  history?: { role: "user" | "assistant"; content: string }[];
}): Promise<PresenceResponse> {
  const result = await orchestrate({
    userId: params.userId,
    memoryId: params.memoryId,
    name: params.name,
    relationship: params.relationship || null,
    lifeStory: params.lifeStory || null,
    userMessage: params.userMessage,
    history: params.history || [],
  });

  // 读取最新的全局情绪强度
  const emoState = getEmotionState();

  return {
    text: result.text,
    emotion: result.emotion,
    emotionIntensity: emoState.intensity,
    audioUrl: result.audioUrl,
    avatarUrl: result.avatarUrl,
    memoryId: params.memoryId,
    cost: result.cost,
    cacheHit: result.cacheHit,
  };
}

// ─── 快捷方法 ──────────────────────────────────────────────
export type { Emotion } from "../volc";
