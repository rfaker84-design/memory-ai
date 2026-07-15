const CHINA_MOBILE = /^1[3-9]\d{9}$/;

export function normalizeChinaPhone(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const compact = value.trim().replace(/[\s()-]/g, "");
  const national = compact.startsWith("+86")
    ? compact.slice(3)
    : compact.startsWith("0086")
      ? compact.slice(4)
      : compact.startsWith("86") && compact.length === 13
        ? compact.slice(2)
        : compact;
  return CHINA_MOBILE.test(national) ? `+86${national}` : null;
}

export function isVerificationCode(value: unknown): value is string {
  return typeof value === "string" && /^\d{6}$/.test(value);
}
