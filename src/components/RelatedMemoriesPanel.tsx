"use client";
import { motion } from "framer-motion";
import type { MemoryCluster } from "../../app/api/memory-relations/route";

interface Props {
  clusters: MemoryCluster[];
  relatedMemories: Array<{ id: string; name: string; relationship: string }>;
  onSelectMemory: (id: string) => void;
}

export default function RelatedMemoriesPanel({ clusters, relatedMemories, onSelectMemory }: Props) {
  if (!clusters.length && !relatedMemories.length) return null;

  return (
    <div className="px-4 py-3" style={{ borderTop: "0.5px solid rgba(255,255,255,0.03)" }}>
      {/* Clusters */}
      {clusters.map((cluster) => (
        <div key={cluster.clusterId} className="mb-3">
          <p style={{ fontSize: 9, color: "rgba(160,150,140,0.2)", letterSpacing: "0.12em", marginBottom: 6 }}>
            {cluster.name.toUpperCase()} · {cluster.memberIds.length}
          </p>
          <div className="flex flex-wrap gap-2">
            {cluster.memberIds.slice(0, 5).map((mid) => {
              const mem = relatedMemories.find(m => m.id === mid);
              if (!mem) return null;
              return (
                <motion.button
                  key={mid}
                  whileHover={{ scale: 1.04 }}
                  onClick={() => onSelectMemory(mid)}
                  className="rounded-full px-3 py-1.5 text-[10px] tracking-[0.05em] transition-all"
                  style={{
                    background: "rgba(30,32,50,0.5)", border: "0.5px solid rgba(255,255,255,0.04)",
                    color: "rgba(180,180,200,0.4)", cursor: "pointer",
                  }}
                >
                  {mem.name}
                </motion.button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}