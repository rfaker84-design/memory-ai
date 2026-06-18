"use client";
import { motion } from "framer-motion";
import type { GlobalCluster } from "../../app/api/global-memory-graph/route";

interface Props {
  clusters: GlobalCluster[];
  onClusterClick: (clusterId: string) => void;
}

/* ====================================================================
   Resonance Cluster View — cosmic data clusters
   ==================================================================== */
export default function ResonanceClusterView({ clusters, onClusterClick }: Props) {
  if (!clusters.length) return null;

  return (
    <div className="px-6 py-5">
      <p style={{
        fontSize: 10, color: "rgba(180,200,240,0.25)", letterSpacing: "0.2em",
        marginBottom: 12, textTransform: "uppercase",
      }}>
        共鸣集群 · Resonance Clusters
      </p>

      <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))" }}>
        {clusters.map((cluster, i) => {
          const hue = cluster.color.hue;
          return (
            <motion.div
              key={cluster.cluster_id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.08, duration: 0.5 }}
              whileHover={{ scale: 1.02, borderColor: `hsla(${hue},50%,60%,0.2)` }}
              onClick={() => onClusterClick(cluster.cluster_id)}
              style={{
                padding: "14px 16px", borderRadius: 18, cursor: "pointer",
                background: "rgba(8,12,30,0.7)", backdropFilter: "blur(14px)",
                border: `0.5px solid rgba(255,255,255,0.04)`,
                transition: "border-color 0.3s",
              }}
            >
              {/* Cluster glow orb */}
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <motion.div
                  animate={{ scale: [1, 1.15, 1], opacity: [0.5, 0.8, 0.5] }}
                  transition={{ duration: 3 + i, repeat: Infinity, ease: "easeInOut" }}
                  style={{
                    width: 24, height: 24, borderRadius: "50%",
                    background: `radial-gradient(circle, hsla(${hue},50%,65%,0.7) 0%, transparent 70%)`,
                    boxShadow: `0 0 16px hsla(${hue},45%,55%,0.3)`,
                    filter: "blur(1px)",
                  }}
                />
                <div>
                  <p style={{ fontSize: 13, fontWeight: 400, color: "rgba(210,225,250,0.85)", margin: 0 }}>
                    {cluster.label}
                  </p>
                  <p style={{ fontSize: 10, color: "rgba(150,170,200,0.4)", margin: "3px 0 0" }}>
                    {cluster.theme}
                  </p>
                </div>
              </div>

              {/* Stats row */}
              <div style={{ display: "flex", gap: 12, marginTop: 10 }}>
                <MiniStat label="节点" value={`${cluster.node_count}`} />
                <MiniStat label="共鸣" value={`${Math.round(cluster.total_resonance * 100)}%`} />
                <MiniStat label="情绪" value={cluster.dominant_emotion.toUpperCase()} />
              </div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p style={{ fontSize: 8, color: "rgba(160,180,210,0.25)", letterSpacing: "0.08em", margin: 0 }}>{label}</p>
      <p style={{ fontSize: 10, color: "rgba(180,200,230,0.45)", margin: "2px 0 0" }}>{value}</p>
    </div>
  );
}