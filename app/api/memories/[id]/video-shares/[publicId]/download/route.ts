import { createOwnerWatermarkedVideoDownloadHandler } from "./_handler";

const handler = createOwnerWatermarkedVideoDownloadHandler();
export const GET = handler.GET;
