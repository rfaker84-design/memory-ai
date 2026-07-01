import type { BaseEvent } from "./event";

export interface EventHandler<T extends BaseEvent = BaseEvent> {
  handle(event: T): void | Promise<void>;
}
