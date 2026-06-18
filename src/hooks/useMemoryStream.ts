"use client";
import { useEffect, useState, useRef, useCallback } from "react";
import type { GlobalMemoryStream } from "../../app/api/global-memory-graph/route";

export default function useMemoryStream(phone: string) {
  const [stream, setStream] = useState<GlobalMemoryStream | null>(null);
  const [loading, setLoading] = useState(true);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/global-memory-graph?phone=${encodeURIComponent(phone)}&stream=1`);
      if (res.ok) {
        const data = await res.json();
        if (data.trending) setStream(data);
      }
    } catch { /* ignore */ }
    setLoading(false);
  }, [phone]);

  // 初始加载
  useEffect(() => {
    if (!phone) return;
    load();
    // 每 30 秒轮询
    pollingRef.current = setInterval(load, 30000);
    return () => { if (pollingRef.current) clearInterval(pollingRef.current); };
  }, [phone, load]);

  // 手动刷新
  const refresh = useCallback(() => { setLoading(true); load(); }, [load]);

  // 标记访问（触发共鸣追踪）
  const touch = useCallback(async (memoryId: string) => {
    fetch("/api/global-memory-graph", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ memoryId, action: "access" }),
    }).catch(() => {});
  }, []);

  return { stream, loading, refresh, touch };
}