import { NextRequest, NextResponse } from "next/server";

import { AuthConfigurationError, requireAllowedOrigin, type AuthSession, verifyRequestSession } from "@/src/server/auth";
import { DatabaseDependencyError, safeDatabaseErrorLog, withPostgresTransaction } from "@/src/server/database";
import { applyAuthNoStore } from "@/src/server/security/auth-cache";

type NotificationPreferences = { greetingNotificationsEnabled: boolean };
type PreferencesService = {
  read(userId: string): Promise<NotificationPreferences>;
  update(input: { userId: string; greetingNotificationsEnabled: boolean }): Promise<NotificationPreferences>;
};
type SessionResolver = (request: NextRequest) => Promise<AuthSession | null>;

const json = (body: Record<string, unknown>, init?: ResponseInit) =>
  applyAuthNoStore(NextResponse.json(body, init));

const preferencesService: PreferencesService = {
  async read(userId) {
    return withPostgresTransaction(async (client) => {
      const result = await client.query<{ greeting_notifications_enabled: boolean }>(
        `SELECT greeting_notifications_enabled
           FROM public.notification_preferences
          WHERE user_id=$1::uuid
          LIMIT 1`,
        [userId],
      );
      return { greetingNotificationsEnabled: result.rows[0]?.greeting_notifications_enabled === true };
    });
  },
  async update({ userId, greetingNotificationsEnabled }) {
    return withPostgresTransaction(async (client) => {
      const result = await client.query<{ greeting_notifications_enabled: boolean }>(
        `INSERT INTO public.notification_preferences (user_id, greeting_notifications_enabled)
         VALUES ($1::uuid, $2::boolean)
         ON CONFLICT (user_id) DO UPDATE
           SET greeting_notifications_enabled=EXCLUDED.greeting_notifications_enabled,
               updated_at=NOW()
         RETURNING greeting_notifications_enabled`,
        [userId, greetingNotificationsEnabled],
      );
      if (result.rows[0] === undefined) throw new Error("NOTIFICATION_PREFERENCE_UNAVAILABLE");
      return { greetingNotificationsEnabled: result.rows[0].greeting_notifications_enabled };
    });
  },
};

function parseUpdate(value: unknown): boolean | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const body = value as Record<string, unknown>;
  if (Object.keys(body).join(",") !== "greetingNotificationsEnabled" || typeof body.greetingNotificationsEnabled !== "boolean") return null;
  return body.greetingNotificationsEnabled;
}

function failure(error: unknown) {
  if (error instanceof DatabaseDependencyError) {
    console.error("[api:notification-preferences] database request failed", safeDatabaseErrorLog(error));
    return json({ error: "NOTIFICATION_PREFERENCES_UNAVAILABLE" }, { status: 503 });
  }
  if (error instanceof AuthConfigurationError) {
    return json({ error: error.code === "ORIGIN_NOT_ALLOWED" ? "ORIGIN_NOT_ALLOWED" : "AUTH_UNAVAILABLE" }, { status: error.code === "ORIGIN_NOT_ALLOWED" ? 403 : 503 });
  }
  console.error("[api:notification-preferences] request failed");
  return json({ error: "NOTIFICATION_PREFERENCES_UNAVAILABLE" }, { status: 503 });
}

export function createNotificationPreferencesHandlers(
  service: PreferencesService = preferencesService,
  sessionResolver: SessionResolver = verifyRequestSession,
) {
  return {
    async GET(request: NextRequest) {
      try {
        const session = await sessionResolver(request);
        if (!session) return json({ error: "UNAUTHENTICATED" }, { status: 401 });
        return json(await service.read(session.userId));
      } catch (error) {
        return failure(error);
      }
    },
    async PATCH(request: NextRequest) {
      try {
        const session = await sessionResolver(request);
        if (!session) return json({ error: "UNAUTHENTICATED" }, { status: 401 });
        requireAllowedOrigin(request);
        const greetingNotificationsEnabled = parseUpdate(await request.json().catch(() => null));
        if (greetingNotificationsEnabled === null) return json({ error: "INVALID_NOTIFICATION_PREFERENCES_REQUEST" }, { status: 400 });
        return json(await service.update({ userId: session.userId, greetingNotificationsEnabled }));
      } catch (error) {
        return failure(error);
      }
    },
  };
}
