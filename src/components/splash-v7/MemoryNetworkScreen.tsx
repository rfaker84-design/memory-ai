"use client";
import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useRouter } from "next/navigation";
import MemoryGraphCanvas from "./MemoryGraphCanvas";
import type { MemoryNode, MemoryGraph, FusionResult, CollectiveAnalysis, MultiChatMessage } from "../../lib/graph-types";
import { NODE_EMOTION_COLORS } from "../../lib/graph-types";

export default function MemoryNetworkScreen() {
  const router = useRouter();
  const [phone, setPhone] = useState("");
  const [graph, setGraph] = useState<MemoryGraph | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [fusion, setFusion] = useState<FusionResult | null>(null);
  const [analysis, setAnalysis] = useState<CollectiveAnalysis | null>(null);
  const [multiMessages, setMultiMessages] = useState<MultiChatMessage[]>([]);
  const [chatLoading, setChatLoading] = useState(false);
  const [mode, setMode] = useState<"graph" | "fusion" | "multi-chat">("graph");

  useEffect(() => {
    const p = localStorage.getItem("yijian_phone");
    if (!p) { router.replace("/login"); return; }
    setPhone(p);
  }, [router]);

  // 加载图谱
  useEffect(() => {
    if (!phone) return;
    (async () => {
      const res = await fetch(`/api/memory-graph?phone=${encodeURIComponent(phone)}`);
      if (res.ok) setGraph(await res.json());
      setLoading(false);
    })();
  }, [phone]);

  // 加载集体分析
  useEffect(() => {
    if (!phone) return;
    fetch(`/api/collective-analysis?phone=${encodeURIComponent(phone)}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => d && setAnalysis(d));
  }, [phone]);

  const handleNodeClick = useCallback((node: MemoryNode) => {
    router.push("/memories/" + node.id);
  }, [router]);

  // 记忆融合
  const handleFusion = useCallback(async () => {
    if (selectedIds.length < 2) return;
    setMode("fusion");
    const res = await fetch("/api/memory-fusion", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ memoryIdA: selectedIds[0], memoryIdB: selectedIds[1] }),
    });
    if (res.ok) setFusion(await res.json());
  }, [selectedIds]);

  // 多人对话
  const handleMultiChat = useCallback(async () => {
    if (!selectedIds.length) return;
    setMode("multi-chat");
    setChatLoading(true);
    const res = await fetch("/api/multi-chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ memoryIds: selectedIds, message: "你们好" }),
    });
    if (res.ok) {
      const data = await res.json();
      setMultiMessages(data.messages || []);
    }
    setChatLoading(false);
  }, [selectedIds]);

  if (loading) {
    return (
      <div className="fixed inset-0 z-[9998] flex items-center justify-center" style={{ background: "#060812" }}>
        <motion.p animate={{ opacity: [0.2, 0.5, 0.2] }} transition={{ duration: 2.5, repeat: Infinity }}
          style={{ fontSize: 14, color: "rgba(255,255,255,0.3)", letterSpacing: "0.15em" }}>
          正在构建记忆网络...
        </motion.p>
      </div>
    );
  }

  const selectedNodes = graph?.nodes.filter(n => selectedIds.includes(n.id)) || [];

  return (
    <div className="fixed inset-0 z-[9998] overflow-hidden" style={{ background: "linear-gradient(180deg, #060812 0%, #0a0e20 50%, #060812 100%)" }}>
      {/* 背景粒子 */}
      <div className="absolute inset-0 pointer-events-none" style={{
        backgroundImage: "radial-gradient(rgba(100,120,180,0.06) 1px, transparent 1px)",
        backgroundSize: "32px 32px",
      }} />

      {/* Header */}
      <div className="absolute top-0 left-0 right-0 z-20 p-6 flex items-center justify-between">
        <motion.button
          whileHover={{ opacity: 0.8 }}
          onClick={() => router.push("/memories")}
          style={{ color: "rgba(255,255,255,0.4)", fontSize: 13, background: "none", border: "none", cursor: "pointer", letterSpacing: "0.08em" }}
        >
          &larr; 记忆列表
        </motion.button>

        <motion.h2 style={{ fontSize: 16, fontWeight: 300, color: "rgba(255,255,255,0.5)", letterSpacing: "0.2em", position: "absolute", left: "50%", transform: "translateX(-50%)" }}>
          记忆网络
        </motion.h2>

        <div style={{ display: "flex", gap: 8 }}>
          {analysis?.hotspotNode && (
            <motion.span
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.6 }}
              style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", letterSpacing: "0.06em", textAlign: "right" }}
            >
              {analysis.hotspotReason}
            </motion.span>
          )}
        </div>
      </div>

      {/* Graph Canvas */}
      <div className="absolute inset-0 top-16 bottom-40">
        {graph && (
          <MemoryGraphCanvas
            nodes={graph.nodes}
            edges={graph.edges}
            onNodeClick={handleNodeClick}
            onNodeSelect={setSelectedIds}
            selectedIds={selectedIds}
          />
        )}
      </div>

      {/* 选中节点信息 */}
      <AnimatePresence>
        {selectedNodes.length > 0 && mode === "graph" && (
          <motion.div
            initial={{ y: 60, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 60, opacity: 0 }}
            className="absolute bottom-0 left-0 right-0 z-20 p-4"
            style={{ background: "rgba(8,10,20,0.85)", backdropFilter: "blur(20px)", borderTop: "1px solid rgba(255,255,255,0.06)" }}
          >
            <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
              {selectedNodes.map(n => (
                <span key={n.id} style={{
                  fontSize: 12, color: NODE_EMOTION_COLORS[n.emotion] || "#888",
                  padding: "4px 10px", borderRadius: 12, border: `1px solid ${NODE_EMOTION_COLORS[n.emotion]}33`,
                  background: `${NODE_EMOTION_COLORS[n.emotion]}11`,
                }}>{n.name}</span>
              ))}
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              {selectedNodes.length >= 2 && (
                <ActionButton label="记忆融合" onClick={handleFusion} color="#FFB86C" />
              )}
              <ActionButton label="群体对话" onClick={handleMultiChat} color="#AAC8E1" />
              <ActionButton label="进入记忆" onClick={() => router.push("/memories/" + selectedIds[0])} color="#8888AA" />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 融合结果 */}
      <AnimatePresence>
        {mode === "fusion" && fusion && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-30 flex items-center justify-center p-8"
            style={{ background: "rgba(4,6,16,0.9)", backdropFilter: "blur(30px)" }}
            onClick={() => setMode("graph")}
          >
            <div onClick={e => e.stopPropagation()} style={{ maxWidth: 400, textAlign: "center" }}>
              <p style={{ fontSize: 20, fontWeight: 300, color: "rgba(255,255,255,0.75)", letterSpacing: "0.1em", marginBottom: 8 }}>{fusion.sharedScene.title}</p>
              <p style={{ fontSize: 14, color: "rgba(255,255,255,0.45)", lineHeight: 1.8, marginBottom: 16 }}>{fusion.sharedScene.description}</p>
              <p style={{ fontSize: 15, color: "rgba(255,200,140,0.6)", fontStyle: "italic", lineHeight: 1.8, marginBottom: 24 }}>&ldquo;{fusion.relationshipInsight}&rdquo;</p>
              <p style={{ fontSize: 13, color: "rgba(255,255,255,0.35)", lineHeight: 1.8, marginBottom: 24 }}>{fusion.unifiedNarrative}</p>
              <button onClick={() => setMode("graph")} style={{ padding: "8px 24px", borderRadius: 20, border: "1px solid rgba(255,255,255,0.15)", background: "transparent", color: "rgba(255,255,255,0.5)", fontSize: 13, cursor: "pointer" }}>返回网络</button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 多人对话 */}
      <AnimatePresence>
        {mode === "multi-chat" && (
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 40 }}
            className="absolute bottom-0 left-0 right-0 z-30 p-5"
            style={{ background: "rgba(6,8,18,0.9)", backdropFilter: "blur(20px)", borderTop: "1px solid rgba(255,255,255,0.06)", maxHeight: "50%", overflowY: "auto" }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12 }}>
              <span style={{ fontSize: 13, color: "rgba(255,255,255,0.4)" }}>群体对话</span>
              <button onClick={() => setMode("graph")} style={{ fontSize: 12, color: "rgba(255,255,255,0.3)", background: "none", border: "none", cursor: "pointer" }}>关闭</button>
            </div>
            {chatLoading ? (
              <p style={{ fontSize: 13, color: "rgba(255,255,255,0.25)" }}>正在生成对话...</p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {multiMessages.map((msg, i) => (
                  <motion.div key={i} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.15 }}
                    style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                    <span style={{ fontSize: 12, color: "rgba(255,200,140,0.7)", fontWeight: 500, minWidth: 48 }}>{msg.fromName}</span>
                    <span style={{ fontSize: 13, color: "rgba(255,255,255,0.55)", lineHeight: 1.6 }}>{msg.content}</span>
                  </motion.div>
                ))}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function ActionButton({ label, onClick, color }: { label: string; onClick: () => void; color: string }) {
  return (
    <motion.button
      whileHover={{ scale: 1.03 }}
      whileTap={{ scale: 0.97 }}
      onClick={onClick}
      style={{
        padding: "8px 18px", borderRadius: 18, fontSize: 12, fontWeight: 400,
        color: "rgba(255,255,255,0.7)", letterSpacing: "0.06em",
        border: `1px solid ${color}33`, background: `${color}11`,
        cursor: "pointer",
      }}
    >
      {label}
    </motion.button>
  );
}