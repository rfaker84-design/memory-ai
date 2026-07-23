import { verifyRequestSession } from "../../../src/server/auth";
import { createMemoryChatHandler, createPaymentQuotaService } from "./_handler";

export const POST = createMemoryChatHandler(
  undefined,
  undefined,
  undefined,
  verifyRequestSession,
  undefined,
  undefined,
  createPaymentQuotaService,
);
