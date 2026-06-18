"use client";
import type { DissolutionState } from "../lib/ecosystem/DissolutionEngine";

interface Props {
  state: DissolutionState | null;
  children: React.ReactNode;
}

export default function UIDissolutionLayer({ state, children }: Props) {
  if (!state) return <>{children}</>;

  const coherence = state.systemCoherence;
  const phase = state.phase;

  // Compute degradation styles
  const blurAmount = phase === "void" ? 1.5 : phase === "dissolving" ? 0.8 : phase === "fragmenting" ? 0.3 : 0;
  const saturateAmount = phase === "void" ? 0.3 : phase === "dissolving" ? 0.6 : 1;
  const layerOpacity = phase === "void" ? 0.45 : phase === "dissolving" ? 0.75 : 1;
  const letterSpacing = phase === "void" ? "0.15em" : phase === "dissolving" ? "0.1em" : phase === "fragmenting" ? "0.05em" : phase === "drifting" ? "0.02em" : "normal";

  const filterStyle = blurAmount > 0
    ? "blur(" + blurAmount.toString() + "px) saturate(" + saturateAmount.toString() + ")"
    : "none";

  // Jitter in later phases
  const jitterX = (phase === "fragmenting" || phase === "dissolving")
    ? Math.sin(state.tick * 0.1) * (1 - coherence) * 6
    : 0;
  const jitterY = (phase === "fragmenting" || phase === "dissolving")
    ? Math.cos(state.tick * 0.13) * (1 - coherence) * 4
    : 0;

  return (
    <div
      style={{
        filter: filterStyle,
        opacity: layerOpacity,
        letterSpacing: letterSpacing,
        marginLeft: jitterX,
        marginTop: jitterY,
        transition: "filter 4s ease, opacity 4s ease, letter-spacing 3s ease",
        position: "relative",
      }}
    >
      {/* Ghost scanlines */}
      {phase === "dissolving" && (
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            zIndex: 50,
            background: "repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(255,255,255," + (0.01 + (1 - coherence) * 0.03).toString() + ") 2px, rgba(255,255,255," + (0.01 + (1 - coherence) * 0.03).toString() + ") 4px)",
          }}
        />
      )}

      {/* Chromatic aberration */}
      {phase === "void" && (
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            zIndex: 50,
            background: "radial-gradient(ellipse at 48% 50%, rgba(255,100,80,0.02) 0%, transparent 70%), radial-gradient(ellipse at 52% 50%, rgba(80,150,255,0.02) 0%, transparent 70%)",
          }}
        />
      )}

      {/* Phase label */}
      <div className="absolute top-2 right-4 pointer-events-none" style={{ zIndex: 40 }}>
        <p style={{
          fontSize: 8,
          color: "rgba(160,150,140,0.4)",
          letterSpacing: "0.15em",
          margin: 0,
          opacity: 0.08 + Math.sin(Date.now() * 0.001) * 0.04,
        }}>
          {phase.toUpperCase()}
        </p>
      </div>

      {children}
    </div>
  );
}