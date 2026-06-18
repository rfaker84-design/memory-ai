"use client";

/**
 * BreathingText — V3 Emotion Motion System
 * Text with subtle breathing/glow animation for key status indicators
 */

interface BreathingTextProps {
  children: React.ReactNode;
  className?: string;
  /** Speed: "slow" (6s), "normal" (3s), "fast" (1.5s) */
  speed?: "slow" | "normal" | "fast";
  /** Use glow variant (for online status dots) */
  glow?: boolean;
}

const speedMap = {
  slow: "6s",
  normal: "3s",
  fast: "1.5s",
};

export default function BreathingText({ children, className = "", speed = "slow", glow = false }: BreathingTextProps) {
  const duration = speedMap[speed];

  return (
    <span
      className={className}
      style={{
        animation: glow
          ? `glow-pulse ${duration} ease-in-out infinite`
          : `slow-breathe ${duration} ease-in-out infinite`,
      }}
    >
      {children}
    </span>
  );
}