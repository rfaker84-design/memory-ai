"use client";
import { useMemo } from "react";
import { motion } from "framer-motion";
import type { Civilization } from "../../app/api/memory-civilizations/route";

interface Props {
  civilizations: Civilization[];
  selectedId: string | null;
  onSelectCivilization: (civId: string) => void;
  onEnterNode: (memoryId: string) => void;
}

/* ====================================================================
   Civilization Map — galaxy-like constellation
   ==================================================================== */
export default function CivilizationMap({ civilizations, selectedId, onSelectCivilization, onEnterNode }: Props) {
  // Build edge list for rendering
  const edges = useMemo(() => {
    const result: { from: Civilization; toId: string; strength: number }[] = [];
    for (const civ of civilizations) {
      for (const edge of civ.connection_edges) {
        // dedup: only render when from.id < to.id
        if (civ.civilization_id < edge.to_civilization_id) {
          result.push({ from: civ, toId: edge.to_civilization_id, strength: edge.strength });
        }
      }
    }
    return result;
  }, [civilizations]);

  return (
    <div className="absolute inset-0" style={{ overflow: "hidden" }}>
      {/* ================================================================
          Connection edges — flowing light lines
          ================================================================ */}
      <svg className="absolute inset-0 pointer-events-none" style={{ width: "100%", height: "100%" }}>
        {edges.map((edge) => {
          const toCiv = civilizations.find(c => c.civilization_id === edge.toId);
          if (!toCiv) return null;
          const x1 = `${edge.from.spatial_center.x}%`;
          const y1 = `${edge.from.spatial_center.y}%`;
          const x2 = `${toCiv.spatial_center.x}%`;
          const y2 = `${toCiv.spatial_center.y}%`;
          return (
            <line
              key={`${edge.from.civilization_id}-${edge.toId}`}
              x1={x1} y1={y1} x2={x2} y2={y2}
              stroke={`rgba(140,180,220,${0.08 + edge.strength * 0.15})`}
              strokeWidth={0.5 + edge.strength * 1.5}
              strokeDasharray="4 6"
            >
              <animate attributeName="stroke-dashoffset" from="20" to="0" dur="8s" repeatCount="indefinite" />
            </line>
          );
        })}
      </svg>

      {/* ================================================================
          Civilization orbs
          ================================================================ */}
      {civilizations.map((civ) => {
        const isSelected = selectedId === civ.civilization_id;
        const isDimmed = selectedId !== null && !isSelected;
        const palette = civ.culture.color_palette;
        const primaryColor = palette[0] || "#AAC8E1";
        const size = 30 + civ.memory_count * 4;

        return (
          <motion.div
            key={civ.civilization_id}
            animate={{
              scale: isSelected ? 1.15 : isDimmed ? 0.75 : 1,
              opacity: isDimmed ? 0.3 : 0.95,
            }}
            transition={{ duration: 0.5, ease: "easeOut" }}
            style={{
              position: "absolute",
              left: `${civ.spatial_center.x}%`,
              top: `${civ.spatial_center.y}%`,
              transform: "translate(-50%, -50%)",
              cursor: "pointer",
            }}
            onClick={() => onSelectCivilization(civ.civilization_id)}
          >
            {/* Outer glow nebula */}
            <motion.div
              animate={{
                scale: [1, 1.12, 1],
                opacity: [0.15, 0.35, 0.15],
              }}
              transition={{ duration: 5 + civ.memory_count * 0.5, repeat: Infinity, ease: "easeInOut" }}
              style={{
                position: "absolute", left: "50%", top: "50%",
                width: size * 1.5, height: size * 1.5,
                transform: "translate(-50%, -50%)", borderRadius: "50%",
                background: `radial-gradient(circle, ${hexToRgba(primaryColor, 0.25)} 0%, transparent 65%)`,
                filter: "blur(20px)", pointerEvents: "none",
              }}
            />

            {/* Mid orbit ring */}
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ duration: 30 + civ.memory_count * 2, repeat: Infinity, ease: "linear" }}
              style={{
                position: "absolute", left: "50%", top: "50%",
                width: size * 0.9, height: size * 0.6,
                transform: "translate(-50%, -50%) rotate(0deg)", borderRadius: "50%",
                border: `0.5px solid ${hexToRgba(primaryColor, 0.12)}`,
                pointerEvents: "none",
              }}
            />

            {/* Core orb */}
            <motion.div
              animate={{
                scale: civ.evolution_stage === "growing" ? [1, 1.12, 1] : [1, 1.05, 1],
                boxShadow: isSelected
                  ? `0 0 ${size * 0.5}px ${hexToRgba(primaryColor, 0.5)}, 0 0 ${size}px ${hexToRgba(primaryColor, 0.25)}`
                  : `0 0 ${size * 0.25}px ${hexToRgba(primaryColor, 0.2)}`,
              }}
              transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
              style={{
                width: size * 0.4, height: size * 0.4,
                borderRadius: "50%",
                background: `radial-gradient(circle at 40% 35%, ${hexToRgba(primaryColor, 0.9)} 0%, ${hexToRgba(palette[2] || primaryColor, 0.4)} 100%)`,
                margin: "0 auto", position: "relative",
              }}
            />

            {/* Member dots orbiting */}
            {civ.member_previews.slice(0, 6).map((member, i) => {
              const angle = (i / Math.min(civ.member_previews.length, 6)) * Math.PI * 2;
              const orbitRadius = size * 0.45;
              const mx = Math.cos(angle) * orbitRadius;
              const my = Math.sin(angle) * orbitRadius * 0.5;
              return (
                <motion.div
                  key={member.memory_id}
                  animate={{
                    x: [mx, mx + 2, mx - 1, mx],
                    y: [my, my - 2, my + 1, my],
                    opacity: [0.5, 0.8, 0.5],
                  }}
                  transition={{ duration: 4 + i, repeat: Infinity, ease: "easeInOut", delay: i * 0.5 }}
                  style={{
                    position: "absolute", left: "50%", top: "50%",
                    width: 4, height: 4, borderRadius: "50%",
                    background: primaryColor,
                    boxShadow: `0 0 6px ${hexToRgba(primaryColor, 0.6)}`,
                    cursor: "pointer",
                    pointerEvents: isSelected ? "auto" : "none",
                  }}
                  onClick={(e) => { e.stopPropagation(); onEnterNode(member.memory_id); }}
                >
                  {isSelected && (
                    <p style={{
                      position: "absolute", top: 8, left: "50%", transform: "translateX(-50%)",
                      fontSize: 8, color: "rgba(200,220,250,0.5)", whiteSpace: "nowrap", margin: 0,
                      pointerEvents: "none",
                    }}>
                      {member.name}
                    </p>
                  )}
                </motion.div>
              );
            })}

            {/* Label */}
            <div style={{
              position: "absolute", left: "50%", top: "108%",
              transform: "translateX(-50%)", textAlign: "center", pointerEvents: "none",
            }}>
              <p style={{
                fontSize: isSelected ? 13 : 11, fontWeight: 400,
                color: isSelected ? "rgba(220,235,255,0.8)" : "rgba(180,200,230,0.5)",
                margin: 0, letterSpacing: "0.1em", whiteSpace: "nowrap",
              }}>
                {civ.name}
              </p>
              <p style={{
                fontSize: 9, color: "rgba(150,170,200,0.3)", margin: "3px 0 0",
                letterSpacing: "0.08em",
              }}>
                {civ.memory_count}记忆 · {civ.dominant_emotion}
              </p>
            </div>

            {/* Evolution badge */}
            {civ.evolution_stage === "growing" && (
              <div style={{
                position: "absolute", top: -8, right: -4,
                fontSize: 8, color: "rgba(140,220,140,0.5)", letterSpacing: "0.1em",
                pointerEvents: "none",
              }}>
                GROWING
              </div>
            )}
            {civ.evolution_stage === "declining" && (
              <div style={{
                position: "absolute", top: -8, right: -4,
                fontSize: 8, color: "rgba(220,140,140,0.5)", letterSpacing: "0.1em",
                pointerEvents: "none",
              }}>
                DECLINING
              </div>
            )}
          </motion.div>
        );
      })}
    </div>
  );
}

function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}