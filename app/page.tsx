"use client";

import { FirstPresenceFlow } from "../src/components/first-presence/FirstPresenceFlow";
import { MotionProvider } from "../src/motion";

export default function HomePage() {
  return (
    <MotionProvider>
      <FirstPresenceFlow />
    </MotionProvider>
  );
}
