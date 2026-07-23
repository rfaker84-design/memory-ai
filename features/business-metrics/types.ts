export const BUSINESS_FUNNEL_STEPS = [
  "login_completed",
  "memory_created",
  "first_greeting_viewed",
  "first_conversation_completed",
  "payment_entry_viewed",
  "order_created",
  "payment_completed",
  "payment_refunded",
] as const;

export type BusinessFunnelStep = (typeof BUSINESS_FUNNEL_STEPS)[number];
export type ClientViewEvent = Extract<BusinessFunnelStep, "first_greeting_viewed" | "payment_entry_viewed">;

export type FunnelStepMetric = {
  event: BusinessFunnelStep;
  users: number;
  conversionFromPrevious: number | null;
  conversionFromLogin: number | null;
};

export type BusinessFunnelReport = {
  from: string;
  to: string;
  steps: FunnelStepMetric[];
};
