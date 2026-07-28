export type NativePurchaseBoundary = {
  productId: string;
  purchase(): Promise<never>;
  restore(): Promise<never>;
};

/** No store SDK or commercial product is wired during the foundation sprint. */
export function disabledIap(productId: string): NativePurchaseBoundary {
  const disabled = async (): Promise<never> => { throw new Error("IAP_NOT_ENABLED"); };
  return { productId, purchase: disabled, restore: disabled };
}
