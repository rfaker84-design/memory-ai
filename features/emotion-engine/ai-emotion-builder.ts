import type { AIEmotionState, CompanionMode, EmotionContext, EmotionIntensity, EmotionType } from "./types";

const COMPANION_MODE_MAP: Record<EmotionType, CompanionMode> = {
  grief: "comfort",
  sad: "comfort",
  lonely: "listen",
  anxious: "comfort",
  angry: "listen",
  hopeful: "encourage",
  warm: "memory",
  neutral: "guide",
};

const RESPONSE_STYLE_MAP: Record<CompanionMode, string> = {
  comfort: "给予温暖陪伴，语速缓慢、语气柔和。",
  listen: "耐心倾听，不要急于给建议，先让对方感到被理解。",
  encourage: "积极回应，肯定用户的情绪，给予希望感。",
  memory: "温柔地一起回忆过去的美好片段，让对方感到被记住。",
  guide: "平和地引导对话，自然过渡到下一个话题。",
};

const INTENSITY_MODIFIER: Record<EmotionIntensity, string> = {
  high: "需要深度回应，避免轻浮或转移话题。",
  medium: "适当回应，自然陪伴。",
  low: "轻松回应，保持对话流畅。",
};

export class AIEmotionBuilder {
  build(userContext: EmotionContext): AIEmotionState {
    const companionMode = COMPANION_MODE_MAP[userContext.emotion];
    const baseStyle = RESPONSE_STYLE_MAP[companionMode];
    const intensityNote = INTENSITY_MODIFIER[userContext.intensity];

    return {
      emotion: userContext.emotion,
      intensity: userContext.intensity,
      responseStyle: baseStyle + " " + intensityNote,
      companionMode,
    };
  }
}
