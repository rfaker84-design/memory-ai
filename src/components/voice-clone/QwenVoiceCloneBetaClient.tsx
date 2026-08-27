"use client";

import { useState } from "react";

type Phase = "idle" | "submitting" | "ready" | "error";

function randomRequestKey(): string {
  return `voice-clone:${crypto.randomUUID()}`;
}

export function QwenVoiceCloneBetaClient({ memoryId }: { memoryId: string }) {
  const [file, setFile] = useState<File | null>(null);
  const [consent, setConsent] = useState(false);
  const [phase, setPhase] = useState<Phase>("idle");
  const [message, setMessage] = useState("");

  async function submit() {
    if (!file || !consent || phase === "submitting") return;
    setPhase("submitting");
    setMessage("");
    try {
      const requestKey = randomRequestKey();
      const consentResponse = await fetch("/api/consents", {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json", "idempotency-key": requestKey },
        body: JSON.stringify({ consentType: "voice_clone", memoryId }),
      });
      if (!consentResponse.ok) {
        setPhase("error");
        setMessage("无法记录本次声音复刻授权。");
        return;
      }

      const form = new FormData();
      form.set("file", file);
      const response = await fetch(`/api/memories/${encodeURIComponent(memoryId)}/voice-clone`, {
        method: "POST",
        credentials: "same-origin",
        headers: { "idempotency-key": randomRequestKey() },
        body: form,
      });
      const body = await response.json().catch(() => ({})) as { error?: string; job?: { status?: string } };
      if (!response.ok) {
        setPhase("error");
        setMessage(body.error === "BETA_NOT_AVAILABLE"
          ? "该内测能力未向当前测试账号开放。"
          : "声音复刻未完成。请确认样本格式、时长和清晰度后重试。"
        );
        return;
      }
      setPhase("ready");
      setMessage(body.job?.status === "ready" ? "声音复刻已完成。" : "本次请求已被安全地去重处理。");
    } catch {
      setPhase("error");
      setMessage("网络连接中断，未确认声音复刻是否完成。");
    }
  }

  return (
    <main className="voiceClonePage">
      <section className="voiceClonePanel" aria-labelledby="voice-clone-title">
        <p className="voiceCloneEyebrow">INTERNAL BETA · STAGING</p>
        <h1 id="voice-clone-title">声音复刻</h1>
        <p className="voiceCloneLead">仅限获准测试账号。样本会在隔离 Staging 环境中提交给 Qwen-Audio-3.0-TTS-Flash，用于生成此记忆对象的 AI 声音。</p>
        <label className="voiceCloneFile">
          <span>选择声音样本</span>
          <input
            type="file"
            accept="audio/wav,audio/mpeg,audio/mp4,.wav,.mp3,.m4a"
            onChange={(event) => setFile(event.currentTarget.files?.[0] ?? null)}
          />
          <small>WAV、MP3 或 M4A；建议 10–20 秒，最多 60 秒与 10 MB；请只使用清晰、单人说话录音。</small>
        </label>
        <label className="voiceCloneConsent">
          <input type="checkbox" checked={consent} onChange={(event) => setConsent(event.currentTarget.checked)} />
          <span>我确认已获得该声音用于本次 AI 声音复刻的必要授权，并知悉这是一项内测 AI 能力。</span>
        </label>
        <button type="button" disabled={!file || !consent || phase === "submitting"} onClick={() => void submit()}>
          {phase === "submitting" ? "正在提交…" : "开始声音复刻"}
        </button>
        {message ? <p className={phase === "error" ? "voiceCloneError" : "voiceCloneStatus"} role="status">{message}</p> : null}
      </section>
    </main>
  );
}
