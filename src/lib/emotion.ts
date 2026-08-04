/**
 * 情绪记忆引擎 V1 - 情感分析模块
 * 基于中文关键词的规则引擎，轻量、可离线运行
 */

export type Emotion = "happy" | "sad" | "lonely" | "tired" | "anxious" | "neutral";

export interface EmotionResult {
  emotion: Emotion;
  confidence: number; // 0-1
  keywords: string[];
}

const EMOTION_RULES: Record<Exclude<Emotion, "neutral">, { keywords: string[]; weight: number }> = {
  happy: {
    keywords: [
      "开心", "高兴", "快乐", "幸福", "真好", "太好了", "哈哈", "嘻嘻", "嘿嘿",
      "好开心", "真开心", "太棒了", "好喜欢", "喜欢", "爱你", "感动", "温暖",
      "好多了", "舒服", "欣慰", "满足", "美好", "开心死了", "笑死", "妙",
    ],
    weight: 1.0,
  },
  sad: {
    keywords: [
      "难过", "伤心", "想哭", "哭了", "好伤心", "难受", "心痛", "心碎",
      "不开心", "不好", "不好受", "不好过", "痛苦", "悲伤", "悲哀", "哀伤",
      "呜呜", "😭", "想他了", "想他了。", "如果", "要是", "为什么",
      "撑不住了", "熬不过去", "不知道怎么", "不想活了",
    ],
    weight: 1.0,
  },
  lonely: {
    keywords: [
      "孤单", "孤独", "一个人", "没人", "寂寞", "很想你", "想你了", "好想你",
      "陪我", "陪陪我", "说说话", "聊聊天", "不在", "身边没有人",
      "没人陪", "没有人", "空空的", "冷清", "我好想你", "陪",
    ],
    weight: 1.2, // lonely 情绪权重略高，更容易触发主动关心
  },
  tired: {
    keywords: [
      "累了", "好累", "累死", "疲惫", "疲劳", "没力气", "没精神", "困了",
      "好困", "想睡", "想休息", "太累了", "累死了", "身心俱疲", "筋疲力尽",
      "力不从心", "没劲", "提不起劲", "不想动",
    ],
    weight: 1.0,
  },
  anxious: {
    keywords: [
      "担心", "害怕", "不安", "焦虑", "紧张", "怎么办", "会不会", "万一",
      "不知道怎么办", "怕", "好怕", "恐惧", "心神不宁", "心慌", "忐忑",
      "不确定", "迷茫", "不知道该", "怎么面对",
    ],
    weight: 1.0,
  },
};

/**
 * 分析文本情绪
 */
export function analyzeEmotion(text: string): EmotionResult {
  const scores: Record<string, number> = {};
  const matchedKeywords: string[] = [];

  for (const [emotion, rule] of Object.entries(EMOTION_RULES)) {
    let score = 0;
    for (const kw of rule.keywords) {
      if (text.includes(kw)) {
        score += rule.weight;
        matchedKeywords.push(kw);
      }
    }
    if (score > 0) {
      scores[emotion] = score;
    }
  }

  if (Object.keys(scores).length === 0) {
    return { emotion: "neutral", confidence: 0.5, keywords: [] };
  }

  // 找最高分
  let topEmotion = "neutral";
  let topScore = 0;
  for (const [emotion, score] of Object.entries(scores)) {
    if (score > topScore) {
      topScore = score;
      topEmotion = emotion;
    }
  }

  return {
    emotion: topEmotion as Emotion,
    confidence: Math.min(topScore / 3, 1), // 归一化到0-1
    keywords: [...new Set(matchedKeywords)],
  };
}

/**
 * 分析最近N条情绪记录，生成情绪摘要
 */
export interface EmotionSummary {
  dominant: Emotion;
  trend: string;       // 如 "连续3轮 sad"
  needsCare: boolean;  // 是否需要主动关心
  careContext: string; // 关心指引
}

export function summarizeRecentEmotions(
  recentEmotions: Array<{ emotion: string; role: string }>,
  windowSize: number = 5
): EmotionSummary {
  const recent = recentEmotions.slice(0, windowSize);
  const userEmotions = recent.filter((e) => e.role === "user").map((e) => e.emotion);

  if (userEmotions.length === 0) {
    return { dominant: "neutral", trend: "暂无数据", needsCare: false, careContext: "" };
  }

  // 计算主导情绪
  const counts: Record<string, number> = {};
  for (const e of userEmotions) {
    counts[e] = (counts[e] || 0) + 1;
  }
  let dominant = "neutral";
  let maxCount = 0;
  for (const [emotion, count] of Object.entries(counts)) {
    if (count > maxCount) {
      maxCount = count;
      dominant = emotion;
    }
  }

  // 趋势分析
  const recent3 = userEmotions.slice(-3);
  let consecutiveCount = 1;
  const trendEmotion = recent3[recent3.length - 1] || "neutral";
  for (let i = recent3.length - 2; i >= 0; i--) {
    if (recent3[i] === trendEmotion) {
      consecutiveCount++;
    } else {
      break;
    }
  }

  const trend =
    consecutiveCount >= 2
      ? `连续${consecutiveCount}轮 ${trendEmotion}`
      : `最近为 ${trendEmotion}`;

  // 是否需要主动关心
  const needsCare =
    dominant === "sad" || dominant === "lonely" || dominant === "anxious";

  const careLabels: Record<string, string> = {
    sad: "用户持续悲伤，表达共情后温和询问是否需要倾诉",
    lonely: "用户感到孤独，温和回应且不声称持续在场；可鼓励联系可信任的人",
    anxious: "用户焦虑不安，先温和回应；不作现实保障承诺",
  };

  return {
    dominant: dominant as Emotion,
    trend,
    needsCare,
    careContext: careLabels[dominant] || "",
  };
}

