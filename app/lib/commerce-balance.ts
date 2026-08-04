/**
 * Historical conversion module quarantine.
 *
 * Formal Commerce does not use emotional state for conversion. Keeping these
 * exports fail-closed prevents a legacy import from reviving dependency-driven
 * prompts or direct user-tier writes.
 */

export type PlanTier = "free" | "pro" | "premium";

export interface TierDefinition {
  tier: PlanTier;
  name: string;
  feeling: string;
  voiceClarity: 1 | 2 | 3;
  videoClarity: 1 | 2 | 3;
  memoryDepth: 1 | 2 | 3;
  emotionContinuity: boolean;
  proactiveCompanion: boolean;
  multiPersonality: boolean;
  voiceCloneFull: boolean;
  chatUnlimited: boolean;
  gentleLine: string;
}

const unavailableTier = (tier: PlanTier): TierDefinition => ({
  tier,
  name: "历史套餐不可用",
  feeling: "请查看正式服务说明。",
  voiceClarity: 1,
  videoClarity: 1,
  memoryDepth: 1,
  emotionContinuity: false,
  proactiveCompanion: false,
  multiPersonality: false,
  voiceCloneFull: false,
  chatUnlimited: false,
  gentleLine: "",
});

export const TIERS: Record<PlanTier, TierDefinition> = {
  free: unavailableTier("free"),
  pro: unavailableTier("pro"),
  premium: unavailableTier("premium"),
};

export interface EmotionLoadResult {
  load: number;
  dominant: string;
  isNight: boolean;
  isHighEmotion: boolean;
  canPromptCommerce: boolean;
  canOnlyCompanion: boolean;
  recentEmotions: string[];
  conversationIntensity: number;
}

export function calculateEmotionLoad(params: { recentEmotions: string[]; userMessage: string; chatRoundCount: number; currentHour: number }): EmotionLoadResult {
  void params;
  return { load: 0, dominant: "neutral", isNight: false, isHighEmotion: false, canPromptCommerce: false, canOnlyCompanion: false, recentEmotions: [], conversationIntensity: 0 };
}

export interface SoftUpgradePrompt {
  shouldShow: boolean;
  title: string;
  body: string;
  target: PlanTier;
  placement: "avatar_center" | "voice_settings" | "memory_settings" | "profile";
  priority: "low" | "gentle";
}

export function generateSoftPrompt(_params: { currentTier: PlanTier; placement: SoftUpgradePrompt["placement"]; avatarGenerated: boolean; voiceTrained: boolean; memoryCount: number }): SoftUpgradePrompt | null {
  return null;
}

export async function getUserTier(_userPhone: string): Promise<PlanTier> {
  return "free";
}

export async function setUserTier(_userPhone: string, _tier: PlanTier): Promise<boolean> {
  return false;
}

export async function getUserCapabilities(_userPhone: string): Promise<{ tier: PlanTier; definition: TierDefinition; nextTier: PlanTier | null; nextDefinition: TierDefinition | null }> {
  return { tier: "free", definition: TIERS.free, nextTier: null, nextDefinition: null };
}
