import { isIsoCalendarDate } from "../account-profile/adult-eligibility";

export const OCCASION_KINDS = ["birthday", "mothers_day", "fathers_day"] as const;
export type OccasionKind = (typeof OCCASION_KINDS)[number];

export type OccasionRewardWindow = {
  occasion: OccasionKind;
  calendarYear: number;
  eligibleOn: string;
  claimDeadline: string;
};

type CalendarDate = { year: number; month: number; day: number };

function iso({ year, month, day }: CalendarDate) {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function daysInMonth(year: number, month: number) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function addDays(date: CalendarDate, days: number): CalendarDate {
  const result = new Date(Date.UTC(date.year, date.month - 1, date.day + days));
  return { year: result.getUTCFullYear(), month: result.getUTCMonth() + 1, day: result.getUTCDate() };
}

function chinaCalendarDate(now: Date): CalendarDate {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const read = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((part) => part.type === type)?.value);
  return { year: read("year"), month: read("month"), day: read("day") };
}

function nthSunday(year: number, month: number, ordinal: number): CalendarDate {
  const first = new Date(Date.UTC(year, month - 1, 1));
  const firstSunday = 1 + ((7 - first.getUTCDay()) % 7);
  return { year, month, day: firstSunday + (ordinal - 1) * 7 };
}

function birthdayInYear(birthDate: string, year: number): CalendarDate | null {
  if (!isIsoCalendarDate(birthDate)) return null;
  const [, monthText, dayText] = birthDate.split("-");
  const month = Number(monthText);
  const day = Math.min(Number(dayText), daysInMonth(year, month));
  return { year, month, day };
}

/**
 * The reward window is evaluated in China Standard Time.  There is no scheduled
 * grant: a user must actively open the entry and claim during this window.
 * A Feb 29 birthday is observed on Feb 28 in non-leap years, keeping the
 * opportunity within February rather than guessing a March anniversary.
 */
export function occasionRewardWindow(
  occasion: OccasionKind,
  birthDate: string,
  now = new Date(),
): OccasionRewardWindow | null {
  const today = chinaCalendarDate(now);
  const eligibleOn = occasion === "birthday"
    ? birthdayInYear(birthDate, today.year)
    : occasion === "mothers_day"
      ? nthSunday(today.year, 5, 2)
      : nthSunday(today.year, 6, 3);
  if (!eligibleOn) return null;
  const thirtyDayDeadline = addDays(eligibleOn, 29);
  const claimDeadline = thirtyDayDeadline.year === today.year
    ? thirtyDayDeadline
    : { year: today.year, month: 12, day: 31 };
  return {
    occasion,
    calendarYear: today.year,
    eligibleOn: iso(eligibleOn),
    claimDeadline: iso(claimDeadline),
  };
}

export function isOccasionClaimOpen(window: OccasionRewardWindow, now = new Date()) {
  const today = iso(chinaCalendarDate(now));
  return today >= window.eligibleOn && today <= window.claimDeadline;
}
