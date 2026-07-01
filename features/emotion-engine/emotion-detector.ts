import type {
  EmotionDetectionInput,
  EmotionDetectionResult,
  EmotionIntensity,
  EmotionType,
} from "./types";

const EMOTION_RULES: { emotion: EmotionType; keywords: string[]; intensity: EmotionIntensity }[] = [
  { emotion: "grief",   keywords: ["想你", "好想你", "很想念", "怀念", "再也见不到", "不在", "不在了"], intensity: "high" },
  { emotion: "sad",     keywords: ["难过", "伤心", "哭", "流泪", "难受", "心痛"], intensity: "medium" },
  { emotion: "lonely",  keywords: ["孤单", "一个人", "孤独", "寂寞"], intensity: "medium" },
  { emotion: "anxious", keywords: ["害怕", "焦虑", "担心", "怎么办", "紧张"], intensity: "medium" },
  { emotion: "angry",   keywords: ["生气", "愤怒", "为什么", "不公平", "凭什么"], intensity: "medium" },
  { emotion: "hopeful", keywords: ["希望", "期待", "开心", "喜欢", "感谢", "谢谢", "真好"], intensity: "low" },
  { emotion: "warm",    keywords: ["温暖", "爱你", "幸福", "惦记", "陪着你", "记得你"], intensity: "low" },
];

export class EmotionDetector {
  detect(input: EmotionDetectionInput): EmotionDetectionResult {
    const text = input.userMessage;

    for (const rule of EMOTION_RULES) {
      const matched = rule.keywords.filter((kw) => text.includes(kw));

      if (matched.length > 0) {
        return {
          emotion: rule.emotion,
          intensity: rule.intensity,
          keywords: matched,
        };
      }
    }

    return {
      emotion: "neutral",
      intensity: "low",
      keywords: [],
    };
  }
}
