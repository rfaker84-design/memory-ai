"use client";
import { motion } from "framer-motion";
import type { MemoryNetwork, MemoryRelation } from "../../app/api/memory-relations/route";

interface Props {
  network: MemoryNetwork | null;
  focusId: string;
  focusName: string;
  onSelectMemory: (id: string) => void;
}

const RELATION_COLORS: Record<string, string> = {
  family: "rgba(255,180,120,",
  emotional: "rgba(255,140,180,",
  contrast: "rgba(140,200,255,",
  support: "rgba(140,220,180,",
};

export default function MemoryNetworkView({ network, focusId, focusName, onSelectMemory }: Props) {
  if (!network || !network.relations.length) return null;

  const relatedIds = [...new Set(network.relations.map(r => r.toId))];
  const relatedMemories = network.relatedMemories.filter(m => relatedIds.includes(m.id)).slice(0, 8);

  // 环形布局
  const positions = relatedMemories.map((_, i) => {
    const angle = (i / Math.max(relatedMemories.length, 1)) * Math.PI * 1.5 - Math.PI * 0.75 + Math.PI / 2;
    const r = 38;
    return { x: 50 + Math.cos(angle) * r, y: 32 + Math.sin(angle) * r * 0.5 };
  });

  return (
    <div className="absolute inset-0 pointer-events-none" style={{ zIndex: 2 }}>
      {/* ================================================================
          SVG flow lines
          ================================================================ */}
      <svg className="absolute inset-0" style={{ width: "100%", height: "100%" }}>
        {relatedMemories.map((rm, i) => {
          const pos = positions[i];
          if (!pos) return null;
          const rel = network.relations.find(r => r.toId === rm.id);
          const color = RELATION_COLORS[rel?.relationType || "emotional"];
          return (
            <line
              key={rm.id}
              x1="50%" y1="35%" x2={`${pos.x}%`} y2={`${pos.y}%`}
              stroke={`${color}${0.1 + (rel?.strength || 0.3) * 0.2})`}
              strokeWidth={0.5 + (rel?.strength || 0.3) * 1.5}
              strokeDasharray="3 5"
            >
              <animate attributeName="stroke-dashoffset" from="16" to="0" dur="6s" repeatCount="indefinite" />
            </line>
          );
        })}
      </svg>

      {/* ================================================================
          Related memory nodes
          ================================================================ */}
      {relatedMemories.map((rm, i) => {
        const pos = positions[i];
        if (!pos) return null;
        const rel = network.relations.find(r => r.toId === rm.id);
        const color = RELATION_COLORS[rel?.relationType || "emotional"];
        return (
          <motion.div
            key={rm.id}
            initial={{ opacity: 0, scale: 0 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.5 + i * 0.1, duration: 0.6 }}
            whileHover={{ scale: 1.15 }}
            style={{
              position: "absolute", left: `${pos.x}%`, top: `${pos.y}%`,
              transform: "translate(-50%, -50%)",
              pointerEvents: "auto", cursor: "pointer",
            }}
            onClick={() => onSelectMemory(rm.id)}
          >
            {/* Glow */}
            <div style={{
              position: "absolute", top: "50%", left: "50%",
              width: 20, height: 20, transform: "translate(-50%, -50%)",
              borderRadius: "50%",
              background: `radial-gradient(circle, ${color}0.3) 0%, transparent 65%)`,
              filter: "blur(5px)",
            }} />
            {/* Core */}
            <div style={{
              width: 8, height: 8, borderRadius: "50%",
              background: `${color}0.7)`,
              boxShadow: `0 0 8px ${color}0.4)`,
            }} />
            {/* Label */}
            <p style={{
              position: "absolute", top: 14, left: "50%", transform: "translateX(-50%)",
              fontSize: 9, color: "rgba(180,170,150,0.4)", whiteSpace: "nowrap", margin: 0,
            }}>
              {rm.name}
            </p>
          </motion.div>
        );
      })}
    </div>
  );
}