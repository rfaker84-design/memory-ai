export type NotificationPreferences = { greetingNotificationsEnabled: boolean };

export class NotificationPreferencesRequestError extends Error {
  constructor(readonly status: number, readonly code: string) {
    super(code);
  }
}

async function readJson(response: Response): Promise<Record<string, unknown>> {
  const value = await response.json().catch(() => ({}));
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function parse(value: Record<string, unknown>): NotificationPreferences {
  return { greetingNotificationsEnabled: value.greetingNotificationsEnabled === true };
}

export async function loadNotificationPreferences(signal?: AbortSignal): Promise<NotificationPreferences> {
  const response = await fetch("/api/account/notification-preferences", { credentials: "same-origin", cache: "no-store", signal });
  const body = await readJson(response);
  if (!response.ok) throw new NotificationPreferencesRequestError(response.status, typeof body.error === "string" ? body.error : "NOTIFICATION_PREFERENCES_UNAVAILABLE");
  return parse(body);
}

export async function updateNotificationPreferences(greetingNotificationsEnabled: boolean): Promise<NotificationPreferences> {
  const response = await fetch("/api/account/notification-preferences", {
    method: "PATCH",
    credentials: "same-origin",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ greetingNotificationsEnabled }),
  });
  const body = await readJson(response);
  if (!response.ok) throw new NotificationPreferencesRequestError(response.status, typeof body.error === "string" ? body.error : "NOTIFICATION_PREFERENCES_UNAVAILABLE");
  return parse(body);
}
