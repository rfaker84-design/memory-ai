import { createPaymentOrdersHandler } from "./_handler";

const handler = createPaymentOrdersHandler();
export const GET = handler.GET;
export const POST = handler.POST;
