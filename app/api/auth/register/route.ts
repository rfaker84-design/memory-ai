import { authJson } from "@/src/server/auth";

export async function POST() {
  return authJson({
    error: "PHONE_VERIFICATION_REQUIRED",
    endpoint: "/api/auth/send-code",
  }, { status: 410 });
}
