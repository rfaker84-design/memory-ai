import { useMemo, type CSSProperties } from "react";
import type { LifeCreationState } from "../types";

interface PresenceParticlesProps {
  mode: LifeCreationState;
}

type Particle = {
  id: number;
  left: string;
  top: string;
  size: number;
  x: number;
  y: number;
  delay: number;
  duration: number;
  opacity: number;
};

function createParticles(): Particle[] {
  return Array.from({ length: 34 }, (_, id) => {
    const angle = (id / 34) * Math.PI * 2;
    const radius = 110 + ((id * 37) % 190);
    const left = 50 + Math.cos(angle) * (18 + ((id * 11) % 27));
    const top = 48 + Math.sin(angle) * (15 + ((id * 7) % 25));

    return {
      id,
      left: `${Math.max(8, Math.min(92, left))}%`,
      top: `${Math.max(10, Math.min(88, top))}%`,
      size: 2 + (id % 4) * 0.7,
      x: Math.cos(angle) * radius,
      y: Math.sin(angle) * radius * 0.75,
      delay: (id % 9) * 0.35,
      duration: 7 + (id % 8),
      opacity: 0.18 + (id % 5) * 0.045,
    };
  });
}

export function PresenceParticles({ mode }: PresenceParticlesProps) {
  const particles = useMemo(createParticles, []);

  return (
    <div className={`presence-particles presence-particles--${mode.toLowerCase()}`} aria-hidden="true">
      {particles.map((particle) => (
        <span
          key={particle.id}
          className="presence-particle"
          style={{
            left: particle.left,
            top: particle.top,
            width: particle.size,
            height: particle.size,
            opacity: particle.opacity,
            "--particle-x": `${particle.x}px`,
            "--particle-y": `${particle.y}px`,
            "--particle-delay": `${particle.delay}s`,
            "--particle-duration": `${particle.duration}s`,
          } as CSSProperties}
        />
      ))}
    </div>
  );
}
