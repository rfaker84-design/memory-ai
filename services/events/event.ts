export interface BaseEvent {
  eventId: string;
  eventType: string;
  occurredAt: Date;
  payload: Record<string, unknown>;
}
