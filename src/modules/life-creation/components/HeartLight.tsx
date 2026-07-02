import type { LifeCreationState } from "../types";

interface HeartLightProps {
  mode: LifeCreationState;
}

export function HeartLight({ mode }: HeartLightProps) {
  return (
    <div className={`heart-light heart-light--${mode.toLowerCase()}`} aria-hidden="true">
      <div className="heart-light__aura" />
      <div className="heart-light__core">
        <svg className="heart-light__mask" viewBox="0 0 180 220" role="presentation">
          <defs>
            <radialGradient id="lifeCoreGlow" cx="50%" cy="45%" r="60%">
              <stop offset="0%" stopColor="#FFF8EA" stopOpacity="0.98" />
              <stop offset="45%" stopColor="#F2E7D2" stopOpacity="0.64" />
              <stop offset="100%" stopColor="#F2E7D2" stopOpacity="0" />
            </radialGradient>
          </defs>
          <path
            d="M91 20C109 47 133 50 145 76c18 39-13 77-54 124C51 153 20 115 36 76 48 49 73 47 91 20Z"
            fill="url(#lifeCoreGlow)"
          />
        </svg>
      </div>
      <div className="heart-light__pulse" />
    </div>
  );
}
