import { createCommerceRefundsHandler } from "./_handler";
import { verifyRequestSession } from "@/src/server/auth";

const handler = createCommerceRefundsHandler(undefined, verifyRequestSession);

export const GET = handler.GET;
export const POST = handler.POST;
