import { createCrisisContactsHandler } from "./_handler";

const handler = createCrisisContactsHandler();
export const GET = handler.GET;
export const POST = handler.POST;
export const PATCH = handler.PATCH;
