import { MemoryEventBus } from "./in-memory-event-bus";
import type { EventBus } from "./event-bus";

let busInstance: EventBus | null = null;

export function getEventBus(): EventBus {
  if (!busInstance) {
    busInstance = new MemoryEventBus();
  }

  return busInstance;
}
