// ╔══════════════════════════════════════════════════════════════╗
// ║  auth.ts — 用户认证系统 (V4 商业闭环)                     ║
// ║  注册 / 登录 / Session / 中间件 / 用户等级                ║
// ╚══════════════════════════════════════════════════════════════╝

import { createClient } from "@supabase/supabase-js";

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error("Supabase 配置缺失");
  return createClient(url, key);
}

// ═══════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════
export type AuthMethod = "phone" | "email";

export interface UserProfile {
  userId: string;
  phone: string | null;
  email: string | null;
  tier: "free" | "pro" | "vip";
  createdAt: string;
  lastLoginAt: string;
  isActive: boolean;
}

export interface AuthResult {
  success: boolean;
  userId?: string;
  phone?: string;
  error?: string;
  sessionToken?: string;
  isNewUser?: boolean;
}

export interface SessionPayload {
  userId: string;
  phone: string;
  tier: "free" | "pro" | "vip";
  iat: number;
  exp: number;
}

// ═══════════════════════════════════════════════════════════════
// Session Token (Simple JWT-like, production: use real JWT)
// ═══════════════════════════════════════════════════════════════
const SESSION_SECRET = process.env.SESSION_SECRET || "yijian-dev-secret-change-in-production";
const SESSION_TTL = 7 * 24 * 60 * 60 * 1000; // 7 days

function encodeSession(payload: SessionPayload): string {
  const header = btoa(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = btoa(JSON.stringify(payload));
  const signature = simpleSign(header + "." + body);
  return header + "." + body + "." + signature;
}

function decodeSession(token: string): SessionPayload | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const payload = JSON.parse(atob(parts[1])) as SessionPayload;
    if (payload.exp < Date.now()) return null;
    // Verify signature
    const expected = simpleSign(parts[0] + "." + parts[1]);
    if (parts[2] !== expected) return null;
    return payload;
  } catch {
    return null;
  }
}

function simpleSign(data: string): string {
  let h = 0;
  const key = SESSION_SECRET + data;
  for (let i = 0; i < key.length; i++) {
    h = ((h << 5) - h) + key.charCodeAt(i);
    h |= 0;
  }
  return Math.abs(h).toString(36);
}

// ═══════════════════════════════════════════════════════════════
// Register (phone-based)
// ═══════════════════════════════════════════════════════════════
export async function registerUser(
  phone: string,
): Promise<AuthResult> {
  const supabase = getSupabase();
  const normalized = phone.replace(/\s+/g, "");

  // Check existing
  const { data: existing } = await supabase
    .from("user_profiles")
    .select("id, phone")
    .eq("phone", normalized)
    .maybeSingle();

  if (existing) {
    return { success: false, error: "该手机号已注册" };
  }

  // Create user
  const userId = "u_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 8);
  const now = new Date().toISOString();

  const { error } = await supabase.from("user_profiles").insert({
    id: userId,
    phone: normalized,
    email: null,
    subscription_tier: "free",
    created_at: now,
    last_login_at: now,
    is_active: true,
  });

  if (error) {
    return { success: false, error: "注册失败: " + error.message };
  }

  const sessionToken = encodeSession({
    userId,
    phone: normalized,
    tier: "free",
    iat: Date.now(),
    exp: Date.now() + SESSION_TTL,
  });

  return {
    success: true,
    userId,
    phone: normalized,
    sessionToken,
    isNewUser: true,
  };
}

// ═══════════════════════════════════════════════════════════════
// Login
// ═══════════════════════════════════════════════════════════════
export async function loginUser(phone: string): Promise<AuthResult> {
  const supabase = getSupabase();
  const normalized = phone.replace(/\s+/g, "");

  const { data: user } = await supabase
    .from("user_profiles")
    .select("*")
    .eq("phone", normalized)
    .maybeSingle();

  if (!user) {
    return { success: false, error: "用户不存在，请先注册" };
  }

  if (!user.is_active) {
    return { success: false, error: "账户已被禁用" };
  }

  // Update last login
  await supabase
    .from("user_profiles")
    .update({ last_login_at: new Date().toISOString() })
    .eq("id", user.id);

  const sessionToken = encodeSession({
    userId: user.id,
    phone: normalized,
    tier: (user.subscription_tier as "free" | "pro" | "vip") || "free",
    iat: Date.now(),
    exp: Date.now() + SESSION_TTL,
  });

  return {
    success: true,
    userId: user.id,
    phone: normalized,
    sessionToken,
    isNewUser: false,
  };
}

// ═══════════════════════════════════════════════════════════════
// Verify session (middleware helper)
// ═══════════════════════════════════════════════════════════════
export function verifySession(token: string): SessionPayload | null {
  return decodeSession(token);
}

// ═══════════════════════════════════════════════════════════════
// Get user profile from DB
// ═══════════════════════════════════════════════════════════════
export async function getUserProfile(userId: string): Promise<UserProfile | null> {
  const supabase = getSupabase();

  const { data } = await supabase
    .from("user_profiles")
    .select("*")
    .eq("id", userId)
    .maybeSingle();

  if (!data) return null;

  return {
    userId: data.id,
    phone: data.phone || null,
    email: data.email || null,
    tier: (data.subscription_tier as "free" | "pro" | "vip") || "free",
    createdAt: data.created_at,
    lastLoginAt: data.last_login_at,
    isActive: data.is_active ?? true,
  };
}

// ═══════════════════════════════════════════════════════════════
// Update user tier (after payment)
// ═══════════════════════════════════════════════════════════════
export async function updateUserTier(
  userId: string,
  tier: "free" | "pro" | "vip",
): Promise<boolean> {
  const supabase = getSupabase();

  const { error } = await supabase
    .from("user_profiles")
    .update({
      subscription_tier: tier,
      tier_updated_at: new Date().toISOString(),
    })
    .eq("id", userId);

  return !error;
}

// ═══════════════════════════════════════════════════════════════
// Get all users (admin)
// ═══════════════════════════════════════════════════════════════
export async function getAllUsers(): Promise<UserProfile[]> {
  const supabase = getSupabase();

  const { data } = await supabase
    .from("user_profiles")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(200);

  if (!data) return [];

  return data.map((u: Record<string, unknown>) => ({
    userId: u.id as string,
    phone: (u.phone as string) || null,
    email: (u.email as string) || null,
    tier: ((u.subscription_tier as string) || "free") as "free" | "pro" | "vip",
    createdAt: u.created_at as string,
    lastLoginAt: u.last_login_at as string,
    isActive: (u.is_active as boolean) ?? true,
  }));
}

// ═══════════════════════════════════════════════════════════════
// User stats for admin
// ═══════════════════════════════════════════════════════════════
export async function getUserStats(): Promise<{
  total: number;
  free: number;
  pro: number;
  vip: number;
  activeToday: number;
}> {
  const supabase = getSupabase();

  const { count: total } = await supabase
    .from("user_profiles")
    .select("*", { count: "exact", head: true });

  const { count: free } = await supabase
    .from("user_profiles")
    .select("*", { count: "exact", head: true })
    .eq("subscription_tier", "free");

  const { count: pro } = await supabase
    .from("user_profiles")
    .select("*", { count: "exact", head: true })
    .eq("subscription_tier", "pro");

  const { count: vip } = await supabase
    .from("user_profiles")
    .select("*", { count: "exact", head: true })
    .eq("subscription_tier", "vip");

  const today = new Date().toISOString().slice(0, 10);
  const { count: activeToday } = await supabase
    .from("user_profiles")
    .select("*", { count: "exact", head: true })
    .gte("last_login_at", today);

  return {
    total: total || 0,
    free: free || 0,
    pro: pro || 0,
    vip: vip || 0,
    activeToday: activeToday || 0,
  };
}
