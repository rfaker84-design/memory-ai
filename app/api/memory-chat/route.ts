import { verifyRequestSession } from "../../../src/server/auth";
import { hasApprovedMemoryCreationConsents } from "@/features/consent/trust-consent-postgres";
import { createMemoryChatHandler, createPaymentQuotaService } from "./_handler";

export const POST = createMemoryChatHandler(
  undefined,
  undefined,
  undefined,
  verifyRequestSession,
  undefined,
  undefined,
  createPaymentQuotaService,
  undefined,
  undefined,
  hasApprovedMemoryCreationConsents,
);
