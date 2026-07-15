import { authJson } from "@/src/server/auth";

export async function POST() {
  return authJson({
    error: "AUTH_ENDPOINT_MIGRATED",
    endpoint: "/api/auth/send-code",
  }, { status: 410 });
}
