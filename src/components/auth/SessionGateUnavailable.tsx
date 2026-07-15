"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type State = "loading" | "unauthenticated" | "unavailable";

export function SessionGateUnavailable({ title }: { title: string }) {
  const [state, setState] = useState<State>("loading");

  useEffect(() => {
    let active = true;
    fetch("/api/auth/session", { cache: "no-store", credentials: "same-origin" })
      .then((response) => {
        if (active) setState(response.ok ? "unavailable" : "unauthenticated");
      })
      .catch(() => { if (active) setState("unavailable"); });
    return () => { active = false; };
  }, []);

  return (
    <main style={{ minHeight: "100dvh", display: "grid", placeItems: "center", background: "#101112", color: "#f3f1ed", padding: 24 }}>
      <section style={{ maxWidth: 420, textAlign: "center" }}>
        <h1 style={{ fontSize: 22 }}>{title}</h1>
        {state === "loading" && <p>正在确认登录状态…</p>}
        {state === "unauthenticated" && <p>请先<Link href="/login">登录</Link>后继续。</p>}
        {state === "unavailable" && <p>此功能尚未迁移到正式 Session 权限体系，当前已安全停用。</p>}
      </section>
    </main>
  );
}
