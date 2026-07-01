import type { BaseEvent } from "./event";
import type { EventBus } from "./event-bus";
import type { EventHandler } from "./event-handler";

export class MemoryEventBus implements EventBus {
  private handlers = new Map<string, EventHandler[]>();

  async publish<T extends BaseEvent>(event: T): Promise<void> {
    const subs = this.handlers.get(event.eventType) ?? [];

    const promises = subs.map((handler) =>
      Promise.resolve(handler.handle(event)).catch((err) =>
        console.error(
          "[MemoryEventBus] handler error for event " + event.eventType + ":",
          err
        )
      )
    );

    await Promise.allSettled(promises);
  }

  subscribe<T extends BaseEvent>(
    eventType: string,
    handler: EventHandler<T>
  ): void {
    const subs = this.handlers.get(eventType) ?? [];
    subs.push(handler as EventHandler);
    this.handlers.set(eventType, subs);
  }

  unsubscribe<T extends BaseEvent>(
    eventType: string,
    handler: EventHandler<T>
  ): void {
    const subs = this.handlers.get(eventType);

    if (!subs) return;

    this.handlers.set(
      eventType,
      subs.filter((h) => h !== (handler as EventHandler))
    );
  }
}
