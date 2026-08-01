import { createAccountDeletionHandler } from "./_handler";

const handler = createAccountDeletionHandler();
export const POST = handler.POST;
export const GET = handler.GET;
