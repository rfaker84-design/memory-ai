import type { BaseEvent } from "./event";
import type { EventHandler } from "./event-handler";

export interface EventBus {
  publish<T extends BaseEvent>(event: T): void | Promise<void>;

  subscribe<T extends BaseEvent>(
    eventType: string,
    handler: EventHandler<T>
  ): void;

  unsubscribe<T extends BaseEvent>(
    eventType: string,
    handler: EventHandler<T>
  ): void;
}
