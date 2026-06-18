"use client";
import { useState, useEffect } from "react";
import type { MemoryNetwork } from "../../app/api/memory-relations/route";

export default function useMemoryNetwork(memoryId: string, phone: string) {
  const [network, setNetwork] = useState<MemoryNetwork | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!memoryId || !phone) return;
    fetch(`/api/memory-relations?memoryId=${memoryId}&phone=${encodeURIComponent(phone)}`)
      .then(r => r.ok ? r.json() : null)
      .then((data: MemoryNetwork | null) => { if (data?.relations) setNetwork(data); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [memoryId, phone]);

  return { network, loading };
}