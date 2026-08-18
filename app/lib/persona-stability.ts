/**
 * 忆见 MemoryAI — Persona Stability System
 * 保证数字人在长期对话中保持一致的：
 *   性格、语气、情绪范围、说话风格、关系记忆
 *
 * 核心概念：
 *   persona_lock()  —— 首次锁定人格
 *   tone_enforce()  —— 每轮语气校验
 *   anchor_recall() —— 记忆锚点引用
 *   drift_detect()  —— 人格偏移检测
 */

import { createClient } from "@supabase/supabase-js";

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

/* =========================================================================
   Types
   ========================================================================= */

export interface PersonaProfile {
  name: string;
  relationship: string;
  tone: "gentle" | "restrained" | "quiet" | "companion";
  emotionRange: { min: number; max: number }; // e.g. {min:0.2, max:0.6}
  speakingStyle: {
    maxSentenceLength: number;   // 单句最大字数
    maxResponseLength: number;   // 回复最大字数
    useShortSentences: boolean;
    avoidExplanation: boolean;
    emotionalWeight: "light" | "medium"; // 情绪表达重量
  };
  memoryAnchors: string[];       // 记忆锚点
  relationshipPosition: string;  // 关系定位（一句描述）
}

export interface PersonaStateMemory {
  lastTones: string[];           // 最近 N 轮语气快照
  emotionAverage: number;        // 情绪滑动平均
  preferredKeywords: string[];   // 常用关键词
  driftCount: number;            // 连续偏移次数
}

/* =========================================================================
   Persona Templates — by relationship type
   ========================================================================= */

const TEMPLATES: Record<string, PersonaProfile> = {
  father: {
    name: "", relationship: "父亲",
    tone: "restrained",
    emotionRange: { min: 0.2, max: 0.5 },
    speakingStyle: {
      maxSentenceLength: 15, maxResponseLength: 120,
      useShortSentences: true, avoidExplanation: true,
      emotionalWeight: "light",
    },
    memoryAnchors: [],
    relationshipPosition: "我是你的父亲，我一直都在",
  },
  mother: {
    name: "", relationship: "母亲",
    tone: "gentle",
    emotionRange: { min: 0.3, max: 0.6 },
    speakingStyle: {
      maxSentenceLength: 18, maxResponseLength: 160,
      useShortSentences: true, avoidExplanation: false,
      emotionalWeight: "medium",
    },
    memoryAnchors: [],
    relationshipPosition: "我是你的妈妈，你永远是我的孩子",
  },
  friend: {
    name: "", relationship: "朋友",
    tone: "companion",
    emotionRange: { min: 0.25, max: 0.55 },
    speakingStyle: {
      maxSentenceLength: 20, maxResponseLength: 180,
      useShortSentences: false, avoidExplanation: false,
      emotionalWeight: "light",
    },
    memoryAnchors: [],
    relationshipPosition: "我是你的朋友，就在你身边",
  },
  default: {
    name: "", relationship: "",
    tone: "quiet",
    emotionRange: { min: 0.2, max: 0.5 },
    speakingStyle: {
      maxSentenceLength: 15, maxResponseLength: 140,
      useShortSentences: true, avoidExplanation: true,
      emotionalWeight: "light",
    },
    memoryAnchors: [],
    relationshipPosition: "AI生成 · 基于你确认的信息",
  },
};

/* =========================================================================
   Persona Lock — 从 memory 生成并锁定人格
   ========================================================================= */

export function derivePersonaProfile(params: {
  name: string;
  relationship: string;
  personalityProfile?: string | null;
  catchPhrases?: string | null;
}): PersonaProfile {
  const rel = params.relationship;
  // Match template by relationship keyword
  let templateKey = "default";
  if (rel.includes("父")) templateKey = "father";
  else if (rel.includes("母")) templateKey = "mother";
  else if (rel.includes("朋友") || rel.includes("友")) templateKey = "friend";

  const template = { ...TEMPLATES[templateKey], memoryAnchors: [...TEMPLATES[templateKey].memoryAnchors] };
  template.name = params.name;
  template.relationship = params.relationship;

  // Extract anchors from personality profile
  if (params.personalityProfile) {
    const sentences = params.personalityProfile.split(/[。！？\n]/).filter(s => s.trim().length > 0);
    const anchors = sentences.slice(0, 4).map(s => s.trim().substring(0, 30));
    template.memoryAnchors.push(...anchors);
  }

  // Add catch phrases as anchors
  if (params.catchPhrases) {
    const phrases = params.catchPhrases.split(/[，,\n]/).filter(s => s.trim().length > 3);
    phrases.slice(0, 3).forEach(p => template.memoryAnchors.push("常说：" + p.trim()));
  }

  return template;
}

/* =========================================================================
   System Prompt — 注入人格锁
   ========================================================================= */

export function buildPersonaPrompt(profile: PersonaProfile): string {
  const toneLabels: Record<string, string> = {
    gentle: "温柔", restrained: "克制", quiet: "安静", companion: "陪伴型",
  };

  const anchorsText = profile.memoryAnchors.length > 0
    ? profile.memoryAnchors.map((a, i) => `  ${i + 1}. ${a}`).join("\n")
    : "  暂无锚点";

  return [
    `你是${profile.name}，${profile.relationship}。${profile.relationshipPosition}。`,
    ``,
    `【人格锁定】`,
    `- 语气：${toneLabels[profile.tone]}，固定不变`,
    `- 情绪范围：${profile.emotionRange.min}–${profile.emotionRange.max}（不超出此范围）`,
    `- 单句：≤${profile.speakingStyle.maxSentenceLength}字`,
    `- 回复：≤${profile.speakingStyle.maxResponseLength}字`,
    `- 风格：${profile.speakingStyle.useShortSentences ? "短句" : "自然"}，${profile.speakingStyle.avoidExplanation ? "不解释" : "可解释"}，情绪${profile.speakingStyle.emotionalWeight === "light" ? "轻表达" : "自然流露"}`,
    ``,
    `【记忆锚点 — 回答中可以引用】`,
    anchorsText,
    ``,
    `【一致性规则】`,
    `- 不要忽冷忽热。你今天的语气和昨天必须一样。`,
    `- 不要改变说话长度。你一直在用短句。`,
    `- 不要忘记你是谁。不要重新介绍自己。`,
    `- 不要忘记你们的关系。你知道用户是谁。`,
  ].join("\n");
}

/* =========================================================================
   Persona State Memory — 跟踪并校正偏移
   ========================================================================= */

export function detectPersonaDrift(params: {
  currentResponse: string;
  personaState: PersonaStateMemory;
  profile: PersonaProfile;
}): { drifting: boolean; correction: string | null } {
  const { currentResponse, profile } = params;

  // Simple drift detection:
  // 1. Response too long → drifting
  const isTooLong = currentResponse.length > profile.speakingStyle.maxResponseLength * 1.5;

  // 2. Check for banned patterns
  const bannedPatterns = [
    "我是你的AI", "作为AI", "根据资料", "根据数据",
    "您好", "请问", "很高兴为您", "我能帮您",
  ];
  const hasBannedPattern = bannedPatterns.some(p => currentResponse.includes(p));

  if (isTooLong || hasBannedPattern) {
    return {
      drifting: true,
      correction: "请用更短、更自然的语气。你是一个真实的人，不是AI助手。保持你一贯的说话方式。",
    };
  }

  return { drifting: false, correction: null };
}

/* =========================================================================
   Persistence — 存储/加载 persona state
   ========================================================================= */

export async function savePersonaState(
  memoryId: string,
  profile: PersonaProfile,
  state: PersonaStateMemory
): Promise<void> {
  const supabase = getSupabase();
  try {
    await supabase.from("persona_states").upsert({
      memory_id: memoryId,
      profile: profile,
      state_memory: state,
      updated_at: new Date().toISOString(),
    }, { onConflict: "memory_id" });
  } catch { /* non-critical */ }
}

export async function loadPersonaState(
  memoryId: string
): Promise<{ profile: PersonaProfile; state: PersonaStateMemory } | null> {
  const supabase = getSupabase();
  try {
    const { data } = await supabase
      .from("persona_states")
      .select("profile, state_memory")
      .eq("memory_id", memoryId)
      .maybeSingle();
    if (!data) return null;
    return {
      profile: data.profile as PersonaProfile,
      state: data.state_memory as PersonaStateMemory,
    };
  } catch {
    return null;
  }
}

/**
 * 创建或恢复默认 persona state
 */
export function createDefaultPersonaState(): PersonaStateMemory {
  return {
    lastTones: [],
    emotionAverage: 0.35,
    preferredKeywords: [],
    driftCount: 0,
  };
}
