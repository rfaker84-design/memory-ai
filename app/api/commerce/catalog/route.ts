import { NextResponse } from "next/server";

import { listCommerceProducts } from "@/features/commerce";

export async function GET() {
  return NextResponse.json({
    products: listCommerceProducts(),
    rules: {
      paidCreditsExpire: false,
      debitOn: "generation_succeeded",
      releaseOn: ["system_failed", "invalidated"],
      firstMemoryPreviewOnly: true,
      maxMemories: 3,
      iosPaymentRail: "storekit_iap",
    },
  });
}
