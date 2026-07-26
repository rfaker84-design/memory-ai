import { CommerceValidationError } from "./errors";
import type { CommerceProduct, CommerceProductId } from "./types";

const PRODUCTS: Readonly<Record<CommerceProductId, CommerceProduct>> = {
  memory_video_49: {
    id: "memory_video_49",
    priceFen: 4900,
    generationCredits: 2,
    grantsFirstPreviewSave: true,
  },
  memory_video_99: {
    id: "memory_video_99",
    priceFen: 9900,
    generationCredits: 6,
    grantsFirstPreviewSave: true,
  },
  memory_video_199: {
    id: "memory_video_199",
    priceFen: 19900,
    generationCredits: 15,
    grantsFirstPreviewSave: true,
  },
};

export function listCommerceProducts(): CommerceProduct[] {
  return Object.values(PRODUCTS).map((product) => ({ ...product }));
}

export function getCommerceProduct(id: string): CommerceProduct {
  const product = PRODUCTS[id as CommerceProductId];
  if (!product) throw new CommerceValidationError("PRODUCT_NOT_FOUND");
  return { ...product };
}
