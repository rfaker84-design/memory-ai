export type PickupRecoveryRecord = {
  id: string;
  originalText: string;
  organizedText: string;
};

export function pickupEditWasPersisted(
  pickups: readonly PickupRecoveryRecord[],
  target: PickupRecoveryRecord,
): boolean {
  return pickups.some((pickup) => pickup.id === target.id
    && pickup.originalText === target.originalText
    && pickup.organizedText === target.organizedText);
}

export function pickupDeleteWasPersisted(
  pickups: readonly PickupRecoveryRecord[],
  pickupId: string,
): boolean {
  return !pickups.some((pickup) => pickup.id === pickupId);
}
