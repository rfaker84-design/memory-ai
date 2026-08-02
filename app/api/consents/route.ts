import { createConsentsHandler, createCrisisSupportConsentRevocationHandler } from "./_handler";

export const POST = createConsentsHandler();
export const DELETE = createCrisisSupportConsentRevocationHandler();
