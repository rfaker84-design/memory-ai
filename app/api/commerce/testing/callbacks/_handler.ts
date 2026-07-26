import { createHash, createHmac, timingSafeEqual } from "node:crypto";

import { NextRequest, NextResponse } from "next/server";

import {
  CommercePostgresDataSource,
  CommerceRepository,
  CommerceService,
  type CommercePaymentEvent,
} from "@/features/commerce";
import { applyAuthNoStore } from "@/src/server/security/auth-cache";

type CallbackService = Pick<CommerceService, "applyPaymentEvent">;
const json = (body: Record<string, unknown>, init?: ResponseInit) =>
  applyAuthNoStore(NextResponse.json(body, init));

function configured(environment: NodeJS.ProcessEnv): string | null {
  const secret = environment.COMMERCE_TEST_CALLBACK_SECRET;
  if (
    environment.NODE_ENV === "production"
    || environment.COMMERCE_TEST_MODE !== "true"
    || !secret
    || secret !== secret.trim()
    || Buffer.byteLength(secret, "utf8") < 32
  ) {
    return null;
  }
  return secret;
}

function signatureMatches(
  rawBody: string,
  supplied: string | null,
  secret: string,
): boolean {
  if (!supplied || !/^[0-9a-f]{64}$/.test(supplied)) return false;
  const expected = createHmac("sha256", secret).update(rawBody).digest();
  const actual = Buffer.from(supplied, "hex");
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export function createCommerceTestCallbackHandler(
  serviceFactory: () => CallbackService = () =>
    new CommerceService(
      new CommerceRepository(new CommercePostgresDataSource()),
    ),
  environment: NodeJS.ProcessEnv = process.env,
) {
  return async function POST(request: NextRequest) {
    const secret = configured(environment);
    if (!secret) {
      return json({ error: "COMMERCE_TEST_CALLBACK_DISABLED" }, { status: 404 });
    }
    const rawBody = await request.text();
    if (
      Buffer.byteLength(rawBody, "utf8") > 16 * 1024
      || !signatureMatches(
        rawBody,
        request.headers.get("x-commerce-test-signature"),
        secret,
      )
    ) {
      return json({ error: "INVALID_TEST_CALLBACK" }, { status: 401 });
    }
    let body: unknown;
    try {
      body = JSON.parse(rawBody);
    } catch {
      return json({ error: "INVALID_TEST_CALLBACK" }, { status: 400 });
    }
    if (typeof body !== "object" || body === null || Array.isArray(body)) {
      return json({ error: "INVALID_TEST_CALLBACK" }, { status: 400 });
    }
    const input = body as Record<string, unknown>;
    const expectedKeys =
      input.kind === "refund"
        ? "amountFen,eventId,kind,orderNo,refundRequestNo,status,transactionId"
        : "amountFen,eventId,kind,orderNo,status,transactionId";
    if (
      Object.keys(input).sort().join(",") !== expectedKeys
      || (input.kind !== "payment" && input.kind !== "refund")
      || !["succeeded", "failed", "cancelled", "refunded"].includes(
        String(input.status),
      )
      || typeof input.eventId !== "string"
      || typeof input.orderNo !== "string"
      || typeof input.transactionId !== "string"
      || !Number.isSafeInteger(input.amountFen)
      || (input.kind === "refund" && typeof input.refundRequestNo !== "string")
    ) {
      return json({ error: "INVALID_TEST_CALLBACK" }, { status: 400 });
    }
    const event: CommercePaymentEvent = {
      eventId: input.eventId,
      kind: input.kind,
      orderNo: input.orderNo,
      ...(input.kind === "refund"
        ? { refundRequestNo: input.refundRequestNo as string }
        : {}),
      transactionId: input.transactionId,
      status: input.status as CommercePaymentEvent["status"],
      amountFen: input.amountFen as number,
      payloadHash: createHash("sha256").update(rawBody).digest("hex"),
    };
    try {
      return json({
        settlement: await serviceFactory().applyPaymentEvent("test", event),
      });
    } catch {
      return json({ error: "TEST_CALLBACK_REJECTED" }, { status: 409 });
    }
  };
}
