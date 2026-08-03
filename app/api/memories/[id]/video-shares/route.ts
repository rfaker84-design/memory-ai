import { createOwnerVideoShareHandler } from "./_handler";

const handler = createOwnerVideoShareHandler();
export const GET = handler.GET;
export const POST = handler.POST;
