import { createPaymentRefundsHandler } from "./_handler";

const handler = createPaymentRefundsHandler();
export const GET = handler.GET;
export const POST = handler.POST;
