import { NextRequest, NextResponse } from "next/server";

import {
  PaymentConfigurationError,
  PaymentNotFoundError,
  PaymentPostgresDataSource,
  PaymentRepository,
  PaymentService,
  PaymentStateError,
  PaymentValidationError,
  getWeChatPayProvider,
  type PaymentCallback,
} from "@/features/payment";
import { DatabaseDependencyError } from "@/src/server/database";
import { applyAuthNoStore } from "@/src/server/security/auth-cache";

type CallbackService = Pick<PaymentService, "applyCallback">;
type CallbackVerifier = { verifyAndParseCallback(headers: Headers, rawBody: string): PaymentCallback };
const json = (body: Record<string, string>, init?: ResponseInit) => applyAuthNoStore(NextResponse.json(body, init));

export function createWeChatPayCallbackHandler(
  serviceFactory: () => CallbackService = () => new PaymentService(new PaymentRepository(new PaymentPostgresDataSource())),
  verifierFactory: () => CallbackVerifier = getWeChatPayProvider,
) {
  return async function POST(request: NextRequest) {
    try {
      const rawBody = await request.text();
      if (Buffer.byteLength(rawBody, "utf8") > 64 * 1024) {
        return json({ code: "FAIL", message: "通知过大" }, { status: 413 });
      }
      const callback = verifierFactory().verifyAndParseCallback(request.headers, rawBody);
      await serviceFactory().applyCallback(callback);
      return json({ code: "SUCCESS", message: "成功" });
    } catch (error) {
      if (error instanceof PaymentValidationError) return json({ code: "FAIL", message: "签名或通知无效" }, { status: 401 });
      if (error instanceof PaymentConfigurationError || error instanceof DatabaseDependencyError) {
        return json({ code: "FAIL", message: "服务暂不可用" }, { status: 503 });
      }
      if (error instanceof PaymentNotFoundError || error instanceof PaymentStateError) {
        return json({ code: "FAIL", message: "订单状态无效" }, { status: 409 });
      }
      console.error("[api:payments:wechat:callback] processing failed");
      return json({ code: "FAIL", message: "处理失败" }, { status: 500 });
    }
  };
}
