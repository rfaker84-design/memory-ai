import type {
  EmotionContext,
  EmotionDetectionResult,
  EmotionType,
} from "./types";

const TONE_MAP: Record<EmotionType, string> = {
  neutral: "平稳、自然地回应。",
  sad: "温柔、体贴地回应，给予安慰。",
  grief: "极度温柔、缓慢、包容地回应，不要轻浮；清楚表明这是 AI 纪念陪伴，不代替现实支持。",
  lonely: "温暖地回应，不宣称持续在场、等待或替代现实关系；可温和鼓励联系可信任的人。",
  anxious: "镇定地回应，不作现实保障承诺；必要时建议可信任的现实支持。",
  angry: "平静、理解地回应，不反驳，先接纳情绪。",
  hopeful: "积极、轻快地回应，共鸣用户的期待。",
  warm: "亲切、柔软地回应，像是家人之间的自然对话。",
};

const TREND_MAP: Record<EmotionType, string> = {
  neutral: "情绪平稳",
  sad: "情绪低落",
  grief: "深度悲伤",
  lonely: "感到孤独",
  anxious: "感到不安",
  angry: "情绪激动",
  hopeful: "充满希望",
  warm: "心情温暖",
};

export class EmotionContextBuilder {
  build(detection: EmotionDetectionResult): EmotionContext {
    return {
      emotion: detection.emotion,
      intensity: detection.intensity,
      suggestedTone: TONE_MAP[detection.emotion],
      trend: TREND_MAP[detection.emotion],
      aiEmotionState: {
        emotion: detection.emotion,
        intensity: detection.intensity,
        responseStyle: "",
        companionMode: "guide",
      },
    };
  }
}
