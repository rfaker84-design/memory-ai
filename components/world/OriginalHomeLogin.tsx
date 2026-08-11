"use client";

import { FirstPresenceFlow } from "../../src/components/first-presence/FirstPresenceFlow";

type OriginalHomeLoginProps = {
  onAuthenticated: () => void | Promise<void>;
  onBackToExperience?: () => void;
  onPreview?: () => void;
};

export function OriginalHomeLogin({ onBackToExperience }: OriginalHomeLoginProps) {
  return (
    <FirstPresenceFlow
      initialStage="login-phone"
      onLeaveHome={onBackToExperience}
    />
  );
}
