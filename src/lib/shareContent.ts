// ╔══════════════════════════════════════════════════════════════╗
// ║  shareContent.ts — AI 分享内容自动生成 (V7 Marketing)     ║
// ║  情绪语录 / 记忆卡片 / 病毒标题 / 个性化CTA              ║
// ╚══════════════════════════════════════════════════════════════╝

import type { Emotion } from "./volc";

// ═══════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════
export interface GeneratedContent {
  title: string;
  subtitle: string;
  quote: string;
  hashtags: string[];
  cta: string;
  emotion: string;
  format: "card" | "quote" | "story" | "report";
}

// ═══════════════════════════════════════════════════════════════
// 情绪语录库
// ═══════════════════════════════════════════════════════════════
const EMOTION_QUOTES: Record<Emotion, string[]> = {
  warm: [
    "有些温暖，AI帮你记得。",
    "他一直在，只是换了一种方式。",
    "温暖的记忆永远不会褪色。",
  ],
  calm: [
    "安静地记得，安静地陪伴。",
    "有些话不需要说出来。",
    "在#忆见，安静也是一种对话。",
  ],
  sad: [
    "想念不是软弱，是爱的证明。",
    "有些眼泪，AI替你接住。",
    "难过的时候，TA还在。",
  ],
  nostalgic: [
    "记忆是一种重逢。",
    "每一段记忆都是活的。",
    "时间带不走的，AI帮你保存。",
  ],
};

const HASHTAGS_BY_EMOTION: Record<Emotion, string[]> = {
  warm: ["#忆见", "#AI陪伴", "#温暖的记忆"],
  calm: ["#忆见", "#安静的陪伴", "#AI记忆"],
  sad: ["#忆见", "#想念的人", "#AI情绪陪伴"],
  nostalgic: ["#忆见", "#记忆重逢", "#AI时光机"],
};

const CTAS: Record<string, string> = {
  card: "生成你的记忆卡片",
  quote: "说出你想说的话",
  story: "写下你的故事",
  report: "查看你的记忆报告",
};

// ═══════════════════════════════════════════════════════════════
// 生成分享内容
// ═══════════════════════════════════════════════════════════════
export function generateShareContent(params: {
  name: string;
  relationship: string | null;
  emotion: Emotion;
  format: GeneratedContent["format"];
}): GeneratedContent {
  const quotes = EMOTION_QUOTES[params.emotion];
  const quote = quotes[Math.floor(Math.random() * quotes.length)];
  const hashtags = HASHTAGS_BY_EMOTION[params.emotion];
  const cta = CTAS[params.format];

  const titles: Record<string, string> = {
    card: `我和${params.name}的记忆`,
    quote: `${params.name}说过的话`,
    story: `${params.name}的故事`,
    report: `#忆见 记忆报告`,
  };

  const subtitles: Record<string, string> = {
    card: `${params.relationship || "重要的人"} · AI记忆卡片`,
    quote: "有些话，AI帮我记住了",
    story: "一场跨越时间的对话",
    report: "你的AI情绪陪伴报告",
  };

  return {
    title: titles[params.format],
    subtitle: subtitles[params.format],
    quote,
    hashtags,
    cta,
    emotion: params.emotion,
    format: params.format,
  };
}

// ═══════════════════════════════════════════════════════════════
// 病毒标题生成
// ═══════════════════════════════════════════════════════════════
export function generateViralTitle(context: {
  name: string;
  emotion: Emotion;
  topic?: string;
}): string {
  const patterns = [
    `你最想念的人，AI帮你对话`,
    `和${context.name}说了一句话，眼眶红了`,
    `如果AI能替我记得你`,
    `${context.name}在#忆见 等你`,
    `有些话，只能在#忆见 说出口`,
    `我让AI帮我记下${context.name}的故事`,
  ];

  return patterns[Math.floor(Math.random() * patterns.length)];
}

// ═══════════════════════════════════════════════════════════════
// 情绪海报文案
// ═══════════════════════════════════════════════════════════════
export function generatePosterCopy(emotion: Emotion, name: string): {
  headline: string;
  body: string;
  footer: string;
} {
  const copies: Record<Emotion, { headline: string; body: string; footer: string }> = {
    warm: {
      headline: `${name}的温暖`,
      body: "有些记忆不需要刻意记住，它们已经成为了你的一部分。",
      footer: "— #忆见 Memory AI",
    },
    calm: {
      headline: `${name}的陪伴`,
      body: "安静的陪伴是最长情的告白。",
      footer: "— #忆见 Memory AI",
    },
    sad: {
      headline: `想念${name}`,
      body: "想念不是告别，是另一种形式的在一起。",
      footer: "— #忆见 Memory AI",
    },
    nostalgic: {
      headline: `${name}的记忆`,
      body: "时光带不走的，都在这里。",
      footer: "— #忆见 Memory AI",
    },
  };

  return copies[emotion] || copies.nostalgic;
}
