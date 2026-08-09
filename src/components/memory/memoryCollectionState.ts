export type PickupCollectionMemory = {
  id: string;
  name: string;
  relationship: string | null;
};

export type PickupCollectionRecord = {
  id: string;
  originalText: string;
  organizedText: string;
  photoAssetId?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ConfirmedMemoryCollectionItem = PickupCollectionRecord & {
  memoryId: string;
  memoryName: string;
  relationship: string | null;
  title: string;
};

export function memoryCollectionTitle(value: string): string {
  const firstLine = value
    .split(/\r?\n/u)
    .map((line) => line.replace(/^\s*[-•]\s*/u, "").trim())
    .find(Boolean) ?? "一段已确认的记忆";
  const characters = Array.from(firstLine);
  return characters.length > 24 ? `${characters.slice(0, 24).join("")}…` : firstLine;
}

export function buildConfirmedMemoryCollection(
  memories: PickupCollectionMemory[],
  recordsByMemory: Map<string, PickupCollectionRecord[]>,
): ConfirmedMemoryCollectionItem[] {
  return memories
    .flatMap((memory) => (recordsByMemory.get(memory.id) ?? []).map((record) => ({
      ...record,
      memoryId: memory.id,
      memoryName: memory.name,
      relationship: memory.relationship,
      title: memoryCollectionTitle(record.organizedText),
    })))
    .sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt));
}
