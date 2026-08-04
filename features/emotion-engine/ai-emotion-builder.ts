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
  comfort: "温和回应，语速缓慢、语气柔和；不得声称真实在场、等待或取代现实支持。",
  listen: "耐心倾听，不要急于给建议；不得暗示用户只能依赖 AI 或 TA。",
  encourage: "积极回应，肯定用户的情绪，给予希望感。",
  memory: "温柔回顾用户已确认的资料，不补充虚构细节，也不宣称真实记得用户。",
  guide: "平和地引导对话，自然过渡到下一个话题。",
};

const INTENSITY_MODIFIER: Record<EmotionIntensity, string> = {
  high: "需要认真回应，避免轻浮或转移话题；危机时交由安全路由处理。",
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
