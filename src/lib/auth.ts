/**
 * Legacy compatibility boundary.
 *
 * Formal authentication is implemented under src/server/auth and is available
 * only through the HttpOnly __Host-memoryai_session cookie. Historical routes
 * still importing this module fail closed until they migrate to that boundary.
 */

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
  isNewUser?: boolean;
}

export interface SessionPayload {
  userId: string;
  phone: string;
  tier: "free" | "pro" | "vip";
  iat: number;
  exp: number;
}

export async function registerUser(_phone?: string): Promise<AuthResult> {
  return { success: false, error: "PHONE_VERIFICATION_REQUIRED" };
}

export async function loginUser(_phone?: string): Promise<AuthResult> {
  return { success: false, error: "PHONE_VERIFICATION_REQUIRED" };
}

export function verifySession(_token?: string): SessionPayload | null {
  return null;
}

export async function getUserProfile(_userId?: string): Promise<UserProfile | null> {
  return null;
}

export async function updateUserTier(
  _userId?: string,
  _tier?: "free" | "pro" | "vip"
): Promise<boolean> {
  return false;
}

export async function getAllUsers(): Promise<UserProfile[]> {
  return [];
}

export async function getUserStats(): Promise<{
  total: number;
  free: number;
  pro: number;
  vip: number;
  activeToday: number;
}> {
  return { total: 0, free: 0, pro: 0, vip: 0, activeToday: 0 };
}
