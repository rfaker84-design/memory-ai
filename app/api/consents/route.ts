import { createConsentsHandler, createCrisisSupportConsentRevocationHandler, createCrisisSupportConsentStatusHandler } from "./_handler";

export const GET = createCrisisSupportConsentStatusHandler();
export const POST = createConsentsHandler();
export const DELETE = createCrisisSupportConsentRevocationHandler();
