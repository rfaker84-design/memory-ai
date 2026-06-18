// ╔══════════════════════════════════════════════════════════════╗
// ║  referral.ts — 裂变推荐系统 (V6 Growth)                   ║
// ║  邀请码生成 / 奖励发放 / 多级统计                         ║
// ╚══════════════════════════════════════════════════════════════╝

import { createClient } from "@supabase/supabase-js";
import { trackGrowthEvent } from "./growth";

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}

// ═══════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════
export interface ReferralCode {
  code: string;
  userId: string;
  totalInvites: number;
  successfulInvites: number;
  rewardsEarned: number;
  createdAt: string;
}

export interface ReferralReward {
  type: "tts_credits" | "chat_boost" | "trial_days";
  amount: number;
  description: string;
}

export interface ReferralResult {
  success: boolean;
  inviterId: string;
  invitedId: string;
  reward?: ReferralReward;
  error?: string;
}

// ═══════════════════════════════════════════════════════════════
// 奖励规则
// ═══════════════════════════════════════════════════════════════
const REWARD_RULES: ReferralReward[] = [
  { type: "tts_credits", amount: 10, description: "10次免费语音" },
  { type: "chat_boost", amount: 20, description: "20次额外对话" },
  { type: "trial_days", amount: 3, description: "3天Pro试用" },
];

// ═══════════════════════════════════════════════════════════════
// 生成邀请码
// ═══════════════════════════════════════════════════════════════
export async function generateReferralCode(userId: string): Promise<string> {
  const supabase = getSupabase();

  // 检查是否已有邀请码
  const { data: existing } = await supabase
    .from("referral_codes")
    .select("code")
    .eq("user_id", userId)
    .maybeSingle();

  if (existing?.code) return existing.code as string;

  // 生成新码 (6位字母数字)
  const code = userId.slice(0, 4).toUpperCase() + Math.random().toString(36).slice(2, 6).toUpperCase();

  await supabase.from("referral_codes").insert({
    code,
    user_id: userId,
    total_invites: 0,
    successful_invites: 0,
    rewards_earned: 0,
    created_at: new Date().toISOString(),
  });

  return code;
}

// ═══════════════════════════════════════════════════════════════
// 使用邀请码注册
// ═══════════════════════════════════════════════════════════════
export async function applyReferralCode(
  code: string,
  newUserId: string,
): Promise<ReferralResult> {
  const supabase = getSupabase();

  // 查找邀请码
  const { data: refCode } = await supabase
    .from("referral_codes")
    .select("*")
    .eq("code", code.toUpperCase())
    .maybeSingle();

  if (!refCode) {
    return { success: false, inviterId: "", invitedId: newUserId, error: "邀请码无效" };
  }

  const inviterId = refCode.user_id as string;

  // 防止自邀请
  if (inviterId === newUserId) {
    return { success: false, inviterId, invitedId: newUserId, error: "不能邀请自己" };
  }

  // 检查是否已被邀请过
  const { data: existingInvite } = await supabase
    .from("referral_invites")
    .select("id")
    .eq("invited_id", newUserId)
    .maybeSingle();

  if (existingInvite) {
    return { success: false, inviterId, invitedId: newUserId, error: "已被邀请过" };
  }

  // 记录邀请
  const reward = REWARD_RULES[Math.floor(Math.random() * REWARD_RULES.length)];

  await supabase.from("referral_invites").insert({
    inviter_id: inviterId,
    invited_id: newUserId,
    code: code.toUpperCase(),
    reward_type: reward.type,
    reward_amount: reward.amount,
    status: "completed",
    created_at: new Date().toISOString(),
  });

  // 更新邀请人统计
  await supabase
    .from("referral_codes")
    .update({
      total_invites: (refCode.total_invites as number) + 1,
      successful_invites: (refCode.successful_invites as number) + 1,
      rewards_earned: (refCode.rewards_earned as number) + reward.amount,
    })
    .eq("code", code.toUpperCase());

  // 增长追踪
  trackGrowthEvent(newUserId, "signup", "referral", inviterId);
  trackGrowthEvent(inviterId, "referral_success", "referral", undefined, { invitedId: newUserId });

  return { success: true, inviterId, invitedId: newUserId, reward };
}

// ═══════════════════════════════════════════════════════════════
// 获取用户邀请统计
// ═══════════════════════════════════════════════════════════════
export async function getUserReferralStats(userId: string): Promise<ReferralCode | null> {
  const supabase = getSupabase();

  const { data } = await supabase
    .from("referral_codes")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();

  if (!data) return null;

  return {
    code: data.code as string,
    userId: data.user_id as string,
    totalInvites: data.total_invites as number,
    successfulInvites: data.successful_invites as number,
    rewardsEarned: data.rewards_earned as number,
    createdAt: data.created_at as string,
  };
}

// ═══════════════════════════════════════════════════════════════
// 获取邀请排行榜
// ═══════════════════════════════════════════════════════════════
export async function getReferralLeaderboard(limit = 20): Promise<ReferralCode[]> {
  const supabase = getSupabase();

  const { data } = await supabase
    .from("referral_codes")
    .select("*")
    .order("successful_invites", { ascending: false })
    .limit(limit);

  if (!data) return [];

  return data.map((r: Record<string, unknown>) => ({
    code: r.code as string,
    userId: r.user_id as string,
    totalInvites: r.total_invites as number,
    successfulInvites: r.successful_invites as number,
    rewardsEarned: r.rewards_earned as number,
    createdAt: r.created_at as string,
  }));
}
