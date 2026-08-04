import { createOwnerVideoShareRevokeHandler, createOwnerVideoShareWatermarkHandler } from "./_handler";

const handler = createOwnerVideoShareRevokeHandler();
const watermarkHandler = createOwnerVideoShareWatermarkHandler();
export const DELETE = handler.DELETE;
export const PATCH = watermarkHandler.PATCH;
