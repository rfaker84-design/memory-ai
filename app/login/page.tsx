"use client";

import { FirstPresenceFlow } from "../../src/components/first-presence/FirstPresenceFlow";
import { MotionProvider } from "../../src/motion";

/**
 * A direct login URL must use the same server-verified SMS flow as the home
 * entry. The flow rechecks the HttpOnly session before showing creation.
 */
export default function LoginPage() {
  return (
    <MotionProvider>
      <FirstPresenceFlow initialStage="login-phone" />
    </MotionProvider>
  );
}
