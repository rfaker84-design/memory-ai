const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isIsoCalendarDate(value: string): boolean {
  const match = ISO_DATE.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return parsed.getUTCFullYear() === year
    && parsed.getUTCMonth() === month - 1
    && parsed.getUTCDate() === day;
}

/** Calendar age, not a rough days/365 estimate. */
export function isAtLeast18(birthDate: string, now = new Date()): boolean {
  if (!isIsoCalendarDate(birthDate)) return false;
  const [year, month, day] = birthDate.split("-").map(Number);
  const currentYear = now.getUTCFullYear();
  const currentMonth = now.getUTCMonth() + 1;
  const currentDay = now.getUTCDate();
  const age = currentYear - year - (currentMonth < month || (currentMonth === month && currentDay < day) ? 1 : 0);
  return age >= 18;
}

export function adultEligibilityError(birthDate: string, now = new Date()): string | null {
  if (!isIsoCalendarDate(birthDate)) return "INVALID_BIRTH_DATE";
  if (!isAtLeast18(birthDate, now)) return "ADULT_ELIGIBILITY_REQUIRED";
  return null;
}
