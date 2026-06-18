"use client";
import { motion } from "framer-motion";
import type { GlobalMemoryNode } from "../../app/api/global-memory-graph/route";

interface Props {
  trending: GlobalMemoryNode[];
  globalMood: string;
  totalMemories: number;
  activeUsers: number;
  onNodeHover: (memoryId: string | null) => void;
  onNodeClick: (memoryId: string) => void;
  resonanceMap: Map<string, { resonance: number; velocity: number }>;
}

/* ====================================================================
   Global Memory Stream — Bloomberg + Cosmos
   ==================================================================== */
export default function GlobalMemoryStream({
  trending, globalMood, totalMemories, activeUsers,
  onNodeHover, onNodeClick, resonanceMap,
}: Props) {
  return (
    <div className="w-full">
      {/* ================================================================
          Stats bar
          ================================================================ */}
      <div className="flex items-center gap-6 px-6 py-3" style={{ borderBottom: "0.5px solid rgba(255,255,255,0.04)" }}>
        <div style={{ fontSize: 10, color: "rgba(180,200,240,0.4)", letterSpacing: "0.1em" }}>
          全球记忆网络
        </div>
        <div className="flex gap-4 ml-auto">
          <StatDot label="记忆总数" value={totalMemories.toLocaleString()} color="rgba(140,180,220,0.5)" />
          <StatDot label="24h活跃" value={activeUsers.toLocaleString()} color="rgba(160,200,140,0.5)" />
          <StatDot label="情绪" value={globalMood} color="rgba(220,180,120,0.5)" />
        </div>
      </div>

      {/* ================================================================
          Trending stream — horizontal scroll
          ================================================================ */}
      <div className="px-6 py-4 overflow-x-auto" style={{ scrollbarWidth: "none" }}>
        <div className="flex gap-3" style={{ minWidth: "max-content" }}>
          {trending.slice(0, 20).map((node, i) => {
            const rn = resonanceMap.get(node.memory_id);
            const resonance = rn?.resonance ?? node.resonance_score;
            const pulseVel = rn?.velocity ?? 0;
            const heat = node.is_trending ? 0.9 : 0.3;
            const hue = node.emotion_vector.valence > 0.5 ? 35 : node.emotion_vector.valence > 0 ? 200 : 260;

            return (
              <motion.div
                key={node.memory_id}
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.04, duration: 0.4 }}
                whileHover={{ scale: 1.03, y: -2 }}
                onMouseEnter={() => onNodeHover(node.memory_id)}
                onMouseLeave={() => onNodeHover(null)}
                onClick={() => onNodeClick(node.memory_id)}
                style={{
                  flexShrink: 0, width: 140, padding: "10px 14px",
                  borderRadius: 16, cursor: "pointer",
                  background: `rgba(8,12,30,0.8)`,
                  backdropFilter: "blur(16px)",
                  border: `0.5px solid hsla(${hue},40%,60%,${0.08 + heat * 0.12})`,
                  boxShadow: `0 0 ${10 + pulseVel * 20}px hsla(${hue},40%,60%,${0.05 + resonance * 0.1})`,
                  position: "relative", overflow: "hidden",
                }}
              >
                {/* Resonance pulse ring */}
                {pulseVel > 0.1 && (
                  <motion.div
                    animate={{ scale: [1, 1.8, 1], opacity: [0.3, 0, 0.3] }}
                    transition={{ duration: 1.2, repeat: Infinity }}
                    style={{
                      position: "absolute", inset: -4, borderRadius: 20,
                      border: `1px solid hsla(${hue},50%,70%,${0.2 * pulseVel})`,
                      pointerEvents: "none",
                    }}
                  />
                )}

                {/* Trending indicator */}
                {node.is_trending && (
                  <div style={{
                    position: "absolute", top: 8, right: 8,
                    width: 5, height: 5, borderRadius: "50%",
                    background: `hsla(${hue},80%,70%,0.9)`,
                    boxShadow: `0 0 6px hsla(${hue},70%,60%,0.6)`,
                  }} />
                )}

                {/* Content */}
                <p style={{
                  fontSize: 13, fontWeight: 400, margin: 0,
                  color: "rgba(210,225,250,0.9)", letterSpacing: "0.04em",
                  whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                }}>
                  {node.name}
                </p>
                <p style={{
                  fontSize: 10, margin: "4px 0 0",
                  color: "rgba(150,170,200,0.5)",
                }}>
                  {node.relationship}
                </p>

                {/* Resonance bar */}
                <div style={{ marginTop: 6, height: 2, borderRadius: 1, background: "rgba(255,255,255,0.06)" }}>
                  <motion.div
                    animate={{ width: `${resonance * 100}%` }}
                    transition={{ duration: 0.5 }}
                    style={{
                      height: "100%", borderRadius: 1,
                      background: `linear-gradient(to right, hsla(${hue},40%,60%,0.4), hsla(${hue+15},50%,65%,0.6))`,
                    }}
                  />
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/* ====================================================================
   Mini stat dot
   ==================================================================== */
function StatDot({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <div style={{ width: 4, height: 4, borderRadius: "50%", background: color }} />
      <span style={{ fontSize: 9, color: "rgba(180,200,230,0.3)", letterSpacing: "0.05em" }}>{label}</span>
      <span style={{ fontSize: 10, color, fontWeight: 400 }}>{value}</span>
    </div>
  );
}