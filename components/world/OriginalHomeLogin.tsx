"use client";

import { FirstPresenceFlow } from "../../src/components/first-presence/FirstPresenceFlow";

type OriginalHomeLoginProps = {
  onAuthenticated: () => void | Promise<void>;
  onBackToExperience?: () => void;
  onPreview?: () => void;
};

export function OriginalHomeLogin({ onAuthenticated, onBackToExperience }: OriginalHomeLoginProps) {
  return (
    <FirstPresenceFlow
      initialStage="login-phone"
      onAuthenticated={onAuthenticated}
      onLeaveHome={onBackToExperience}
    />
  );
}
