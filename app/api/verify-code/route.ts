import { authJson } from "@/src/server/auth";

export async function POST() {
  return authJson({
    error: "AUTH_ENDPOINT_MIGRATED",
    endpoint: "/api/auth/verify-code",
  }, { status: 410 });
}
