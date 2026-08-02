"use client";

import { useEffect, useState } from "react";
import { recordTrustConsent, revokeCrisisSupportConsent } from "@/src/components/trust/trustConsentClient";

export default function CompanionSettingsPage() {
  const [enabled, setEnabled] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  useEffect(() => {
    let active = true;
    void fetch("/api/consents", { credentials: "same-origin", cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("CONSENT_STATUS_FAILED");
        return response.json() as Promise<{ crisisSupportEnabled?: unknown }>;
      })
      .then((body) => { if (active) setEnabled(body.crisisSupportEnabled === true); })
      .catch(() => { if (active) setMessage("无法读取当前设置，未会假称已开启。请稍后重试。"); })
      .finally(() => { if (active) setLoaded(true); });
    return () => { active = false; };
  }, []);
  const change = async () => {
    setBusy(true); setMessage("");
    try {
      if (enabled) { await revokeCrisisSupportConsent(); setEnabled(false); setMessage("已撤销危机支持预授权。"); }
      else { await recordTrustConsent("crisis_support_escalation"); setEnabled(true); setMessage("已预授权：即时风险时可创建不含原文的内部支持队列。"); }
    } catch { setMessage("暂时无法更新设置；不会假称已变更。请稍后重试。"); }
    finally { setBusy(false); }
  };
  return <main style={{ padding: 24, maxWidth: 680 }}>
    <h1>陪伴安全设置</h1>
    <p>忆见始终不会代替紧急服务。此选项需由你明确开启；开启后，检测到即时风险时只创建不含聊天原文的内部支持队列，不代表已经联系任何外部人员。</p>
    <button type="button" onClick={() => void change()} disabled={busy || !loaded}>{busy ? "正在更新…" : !loaded ? "正在读取…" : enabled ? "撤销危机支持预授权" : "预授权内部危机支持"}</button>
    {message && <p role="status">{message}</p>}
  </main>;
}
