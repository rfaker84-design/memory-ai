"use client";

import { ChangeEvent, FormEvent, useCallback, useEffect, useId, useRef, useState } from "react";

import { createMemoryRequestHeaders } from "../create-memory/createMemoryLogic";
import { MemoryAvatar, MemoryButton, MemoryInput, MemorySurface } from "../memory-ui";
import { MemoryMotion } from "../../design";
import { useReducedMotion } from "../../motion";

import { MemoryConversationScene } from "./MemoryConversationScene";
import { recordTrustConsent, TrustConsentRequestError } from "../trust/trustConsentClient";
import styles from "./FirstPresenceFlow.module.css";

type FlowStage =
  | "home"
  | "login-phone"
  | "login-code"
  | "sms-unavailable"
  | "create"
  | "creating"
  | "upload-failed"
  | "created"
  | "network-failed"
  | "preview-create"
  | "preview-generating"
  | "preview-greeting"
  | "preview-failed";
type AuthState = "checking" | "authenticated" | "unauthenticated" | "unavailable";
type RetryAction = "send-code" | "verify-code" | "create" | "upload" | null;
type ApiPayload = { error?: string; challengeId?: string; authenticated?: boolean; id?: string; name?: string; asset?: { id?: string } };
type FirstPresenceFlowProps = {
  initialStage?: FlowStage;
  onLeaveHome?: () => void;
};

const greeting = "我在。我们可以先从你想说的那一件小事开始。";
const VISUAL_PREVIEW_ENABLED = process.env.NODE_ENV !== "production" && process.env.NEXT_PUBLIC_MEMORYAI_ENABLE_PRESENCE_PREVIEW === "true";

async function responsePayload(response: Response): Promise<ApiPayload> {
  return response.json().catch(() => ({})) as Promise<ApiPayload>;
}

function clientIdempotencyKey() {
  const random = typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `presence-${random}`;
}

export function FirstPresenceFlow({ initialStage = "home", onLeaveHome }: FirstPresenceFlowProps) {
  const reducedMotion = useReducedMotion();
  const [stage, setStage] = useState<FlowStage>(initialStage);
  const [authState, setAuthState] = useState<AuthState>("checking");
  const [name, setName] = useState("");
  const [relationship, setRelationship] = useState("");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [challengeId, setChallengeId] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [trustAccepted, setTrustAccepted] = useState(false);
  const [createdMemory, setCreatedMemory] = useState<{ id: string; name: string } | null>(null);
  const [error, setError] = useState("");
  const [retryAction, setRetryAction] = useState<RetryAction>(null);
  const [previewRetried, setPreviewRetried] = useState(false);
  const [busy, setBusy] = useState(false);
  const idempotencyKey = useRef<string | null>(null);
  const titleId = useId();

  const refreshSession = useCallback(async () => {
    try {
      const response = await fetch("/api/auth/session", { cache: "no-store", credentials: "same-origin" });
      const payload = await responsePayload(response);
      setAuthState(response.ok && payload.authenticated ? "authenticated" : "unauthenticated");
      return response.ok && payload.authenticated;
    } catch {
      setAuthState("unavailable");
      return false;
    }
  }, []);

  useEffect(() => { void refreshSession(); }, [refreshSession]);

  useEffect(() => {
    if (stage !== "preview-generating") return;
    const timer = window.setTimeout(() => setStage("preview-greeting"), reducedMotion ? 150 : 2200);
    return () => window.clearTimeout(timer);
  }, [reducedMotion, stage]);

  const displayName = name.trim() || "TA";
  const isPreview = stage.startsWith("preview-");
  const stageLabel: Record<FlowStage, string> = {
    home: "首访首页", "login-phone": "短信登录", "login-code": "验证短信", "sms-unavailable": "短信暂未开放",
    create: "创建亲人", creating: "正在创建", "upload-failed": "素材上传失败", created: "真实对话", "network-failed": "网络暂时中断",
    "preview-create": "视觉预览", "preview-generating": "视觉预览 · 正在生成", "preview-greeting": "视觉预览 · 第一句问候", "preview-failed": "视觉预览 · 生成失败",
  };

  const resetError = () => { setError(""); setRetryAction(null); };
  const beginSecureFlow = () => { idempotencyKey.current = null; setCreatedMemory(null); resetError(); setStage(authState === "authenticated" ? "create" : "login-phone"); };
  const openPreview = () => { resetError(); setPreviewRetried(false); setStage("preview-create"); };

  const sendCode = async () => {
    if (!/^1\d{10}$/.test(phone.trim())) { setError("请输入有效的中国大陆手机号。"); return; }
    setBusy(true); resetError();
    try {
      const response = await fetch("/api/auth/send-code", {
        method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ phone: phone.trim() }),
      });
      const payload = await responsePayload(response);
      if (response.status === 503) {
        const smsUnavailable = payload.error === "SMS_PROVIDER_CONFIGURATION_INVALID" || payload.error === "SMS_UNAVAILABLE";
        setError(smsUnavailable
          ? "短信登录暂未开放。请稍后再试，当前不会创建登录会话或写入任何亲人资料。"
          : "短信登录暂未开放或登录服务暂时不可用。当前不会创建登录会话或写入任何亲人资料。请稍后重试。");
        setStage("sms-unavailable");
        return;
      }
      if (!response.ok || !payload.challengeId) { setError(response.status === 429 ? "请求过于频繁，请稍后再试。" : "暂时无法发送验证码，请检查号码后重试。"); return; }
      setChallengeId(payload.challengeId); setCode(""); setStage("login-code");
    } catch {
      setError("网络连接中断，尚未发送验证码。恢复连接后可以安全重试。"); setRetryAction("send-code"); setStage("network-failed");
    } finally { setBusy(false); }
  };

  const verifyCode = async () => {
    if (!challengeId || !/^\d{6}$/.test(code.trim())) { setError("请输入 6 位短信验证码。"); return; }
    setBusy(true); resetError();
    try {
      const response = await fetch("/api/auth/verify-code", {
        method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: phone.trim(), challengeId, code: code.trim() }),
      });
      const payload = await responsePayload(response);
      if (!response.ok || !payload.authenticated) { setError("验证码无效或已过期，请重新获取短信验证码。"); return; }
      const authenticated = await refreshSession();
      if (!authenticated) { setError("登录状态未能确认，请重新验证短信。"); setStage("login-phone"); return; }
      setStage("create");
    } catch {
      setError("网络连接中断，尚未建立登录会话。恢复连接后可以安全重试。"); setRetryAction("verify-code"); setStage("network-failed");
    } finally { setBusy(false); }
  };

  const uploadSelectedFile = async (memory: { id: string; name: string }) => {
    if (!selectedFile) return true;
    try {
      await recordTrustConsent("media_asset", memory.id);
    } catch {
      setError("素材授权确认暂未安全记录；素材尚未上传。恢复连接后可重试，不会自动上传。");
      setStage("upload-failed");
      return false;
    }
    const form = new FormData();
    form.append("file", selectedFile);
    form.append("memoryId", memory.id);
    const response = await fetch("/api/media/upload", { method: "POST", credentials: "same-origin", body: form });
    const payload = await responsePayload(response);
    if (!response.ok || !payload.asset?.id) {
      if (response.status === 401) { setAuthState("unauthenticated"); setError("登录状态已过期，素材尚未上传。请重新验证短信后重试。"); setStage("login-phone"); return false; }
      setError("素材上传失败。亲人资料已创建，素材仍可单独重试。");
      setStage("upload-failed");
      return false;
    }
    return true;
  };

  const createRealPresence = async () => {
    if (authState !== "authenticated") { setError("需要先完成真实短信登录，才可创建亲人资料。"); setStage("login-phone"); return; }
    if (!name.trim() || !relationship.trim()) { setError("请填写 TA 的名字和与你的关系。"); return; }
    if (!trustAccepted) { setError("请先确认 AI 说明、隐私处理、素材权利与成年要求。"); return; }
    setBusy(true); resetError(); setStage("creating");
    try {
      await recordTrustConsent("memory_profile");
      idempotencyKey.current ||= clientIdempotencyKey();
      const response = await fetch("/api/memories", {
        method: "POST", credentials: "same-origin", headers: createMemoryRequestHeaders(idempotencyKey.current),
        body: JSON.stringify({ name: name.trim(), relationship: relationship.trim() }),
      });
      const payload = await responsePayload(response);
      if (response.status === 401) { setAuthState("unauthenticated"); setError("登录状态已过期，尚未创建亲人资料。请重新验证短信。"); setStage("login-phone"); return; }
      if (!response.ok || !payload.id) { setError("亲人资料暂时无法创建，尚未进入生成或对话。请稍后重试。"); setRetryAction("create"); setStage("network-failed"); return; }
      const memory = { id: payload.id, name: payload.name || name.trim() };
      setCreatedMemory(memory);
      const uploaded = await uploadSelectedFile(memory);
      if (uploaded) setStage("created");
    } catch (cause) {
      if (cause instanceof TrustConsentRequestError) {
        setError("确认记录暂未安全保存；尚未创建 TA 或上传素材。恢复连接后可明确重试。");
        setRetryAction("create");
        setStage("network-failed");
        return;
      }
      setError("网络连接中断，无法确认亲人资料是否已创建。请稍后从资料列表确认后再继续。"); setRetryAction("create"); setStage("network-failed");
    } finally { setBusy(false); }
  };

  const retryUpload = async () => {
    if (!createdMemory) return;
    setBusy(true); resetError();
    try { if (await uploadSelectedFile(createdMemory)) setStage("created"); }
    catch { setError("网络连接中断，素材尚未上传。恢复连接后可再次重试。"); setRetryAction("upload"); setStage("network-failed"); }
    finally { setBusy(false); }
  };

  const retryNetwork = () => {
    if (retryAction === "send-code") void sendCode();
    else if (retryAction === "verify-code") void verifyCode();
    else if (retryAction === "create") void createRealPresence();
    else if (retryAction === "upload") void retryUpload();
  };

  const chooseFile = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0] ?? null;
    if (file && !(file.type.startsWith("image/") || file.type.startsWith("audio/"))) { setError("仅支持图片或音频素材。素材不会在登录前上传。"); return; }
    setSelectedFile(file); resetError();
  };

  const createPreview = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!name.trim() || !relationship.trim()) { setError("请填写 TA 的名字和与你的关系。"); return; }
    resetError(); setStage("preview-generating");
  };

  const retryPreviewGeneration = () => { setPreviewRetried(true); resetError(); setStage("preview-generating"); };

  return (
    <MemorySurface variant="background" className={styles.scene} style={{ "--motion-duration": `${reducedMotion ? 0 : MemoryMotion.duration.enter}ms` } as React.CSSProperties}>
      <div className={styles.frame}>
        <header className={styles.header}>
          <button className={styles.wordmark} type="button" onClick={() => setStage("home")} aria-label="回到忆见首页">忆见 <span>memoryai</span></button>
          <span className={styles.step} aria-live="polite">{stageLabel[stage]}</span>
        </header>

        <main className={styles.main} aria-labelledby={titleId}>
          <section className={`${styles.presenceStage} ${stage === "preview-greeting" || stage === "created" ? styles.present : ""}`} aria-label="亲人形象">
            <div className={styles.lightColumn} aria-hidden="true" /><div className={styles.ringOne} aria-hidden="true" /><div className={styles.ringTwo} aria-hidden="true" />
            <div className={styles.figureWrap}>
              <div className={styles.figureAura} aria-hidden="true" />
              <MemoryAvatar initials={displayName} presence={stage === "preview-greeting" || stage === "created" ? "online" : "quiet"} size={136} />
              <span className={styles.presenceName}>{stage === "home" || stage.startsWith("login") ? "一个熟悉的人，会慢慢来到这里" : displayName}</span>
            </div>
          </section>

          <section className={styles.controlShell} aria-describedby="flow-description">
            {isPreview && <p className={styles.previewNotice}>视觉预览：不创建登录会话，不调用创建、上传、聊天或媒体写接口。</p>}
            {stage === "home" && <div className={styles.copyBlock}>
              <p className={styles.kicker}>不是档案，也不是一次性表单</p><h1 id={titleId}>让想念的人，<br />先被好好看见。</h1>
              <p id="flow-description">从一个名字、一段关系开始。人物会先出现，其余的事，我们慢慢做。</p>
              {authState === "checking" && <p className={styles.inlineStatus} role="status">正在确认你的登录状态…</p>}
              {authState === "unavailable" && <p className={styles.inlineStatus} role="status">暂时无法确认登录状态；不会进入受保护功能。</p>}
              <div className={styles.actions}><MemoryButton variant="primary" onClick={beginSecureFlow}>开始遇见</MemoryButton>{VISUAL_PREVIEW_ENABLED && <button className={styles.textButton} type="button" onClick={openPreview}>开发视觉预览</button>}</div>
            </div>}

            {stage === "login-phone" && <form className={styles.copyBlock} onSubmit={(event) => { event.preventDefault(); void sendCode(); }} noValidate>
              <p className={styles.kicker}>真实短信登录</p><h1 id={titleId}>先确认，是你。</h1><p id="flow-description">验证码只由服务器验证并设置安全会话。输入手机号不会自动进入创建或对话。</p>
              <p className={styles.trustLinks}>登录前可阅读 <a href="/privacy">隐私政策</a>、<a href="/terms">用户协议</a> 与 <a href="/authorization">AI 内容和素材说明</a>；完成验证后，创建、上传和购买前会再次要求明确确认并记录。</p>
              <MemoryInput label="手机号" type="tel" inputMode="numeric" autoComplete="tel" value={phone} onChange={(event: ChangeEvent<HTMLInputElement>) => setPhone(event.currentTarget.value)} autoFocus error={error || undefined} />
              <div className={styles.actions}><MemoryButton type="submit" loading={busy}>发送验证码</MemoryButton><button className={styles.textButton} type="button" onClick={() => setStage("home")}>返回</button></div>
            </form>}

            {stage === "login-code" && <form className={styles.copyBlock} onSubmit={(event) => { event.preventDefault(); void verifyCode(); }} noValidate>
              <p className={styles.kicker}>验证短信</p><h1 id={titleId}>输入 6 位验证码。</h1><p id="flow-description">验证成功后会由服务器设置会话；页面会重新核验会话后才显示创建入口。</p>
              <MemoryInput label="短信验证码" type="text" inputMode="numeric" autoComplete="one-time-code" value={code} onChange={(event: ChangeEvent<HTMLInputElement>) => setCode(event.currentTarget.value)} autoFocus error={error || undefined} />
              <div className={styles.actions}><MemoryButton type="submit" loading={busy}>验证并继续</MemoryButton><button className={styles.textButton} type="button" onClick={() => setStage("login-phone")}>更换号码</button></div>
            </form>}

            {stage === "sms-unavailable" && <div className={styles.copyBlock} role="alert"><p className={styles.kicker}>短信暂未开放</p><h1 id={titleId}>这次不能安全登录。</h1><p id="flow-description">{error}</p><div className={styles.actions}><MemoryButton variant="secondary" onClick={() => setStage("login-phone")}>稍后重试</MemoryButton><button className={styles.textButton} type="button" onClick={() => setStage("home")}>回到首页</button></div></div>}

            {stage === "create" && <form className={styles.copyBlock} onSubmit={(event) => { event.preventDefault(); void createRealPresence(); }} noValidate>
              <p className={styles.kicker}>已验证的创建</p><h1 id={titleId}>TA 是谁？</h1><p id="flow-description">只有已确认的服务器会话才可以创建资料。可选素材会在资料创建后按所属关系上传。</p>
              <div className={styles.fieldGrid}><MemoryInput label="TA 的名字" value={name} onChange={(event: ChangeEvent<HTMLInputElement>) => setName(event.currentTarget.value)} autoFocus error={error || undefined} /><MemoryInput label="与你的关系" value={relationship} onChange={(event: ChangeEvent<HTMLInputElement>) => setRelationship(event.currentTarget.value)} /></div>
              <label className={styles.fileField}>可选图片或音频素材 <span>{selectedFile?.name || "未选择；不会在登录前上传"}</span><input type="file" accept="image/*,audio/*" onChange={chooseFile} /></label>
              <div className={styles.trustNotice}><strong>创建前请确认</strong><span>忆见的回应由 AI 生成，不是现实中的 TA，也不提供医疗或心理治疗建议。只提交你有权使用的资料；上传前会记录素材授权。资料处理方式见 <a href="/privacy">隐私政策</a>，使用边界见 <a href="/terms">用户协议</a> 与 <a href="/authorization">AI 内容和素材说明</a>。你可在 <a href="/report">投诉与删除</a> 提交数据删除或退款相关请求。</span></div>
              <label className={styles.trustCheck}><input type="checkbox" checked={trustAccepted} onChange={(event) => setTrustAccepted(event.currentTarget.checked)} /><span>我已年满 18 周岁，理解上述 AI 身份与资料处理说明，并确认我拥有提交内容和素材的合法权利。</span></label>
              <div className={styles.actions}><MemoryButton type="submit" loading={busy}>安全创建 TA</MemoryButton><button className={styles.textButton} type="button" onClick={() => setStage("home")}>稍后再说</button></div>
            </form>}

            {stage === "creating" && <div className={styles.copyBlock} role="status" aria-live="polite"><p className={styles.kicker}>正在安全创建</p><h1 id={titleId}>{displayName} 的资料正在写入。</h1><p id="flow-description">正在等待服务器确认。未确认前不会显示生成成功或第一句问候。</p><div className={styles.progressLine} aria-hidden="true"><span /></div></div>}

            {stage === "upload-failed" && <div className={styles.copyBlock} role="alert"><p className={styles.kicker}>素材上传失败</p><h1 id={titleId}>资料已创建，素材仍未上传。</h1><p id="flow-description">{error}</p><div className={styles.actions}><MemoryButton variant="primary" loading={busy} onClick={() => void retryUpload()}>重试素材上传</MemoryButton><button className={styles.textButton} type="button" onClick={() => setStage("created")}>暂不上传</button></div></div>}

            {stage === "created" && createdMemory && idempotencyKey.current && <MemoryConversationScene memoryId={createdMemory.id} memoryName={createdMemory.name} firstGreetingKey={idempotencyKey.current} onLeave={() => { idempotencyKey.current = null; setCreatedMemory(null); if (onLeaveHome) onLeaveHome(); else setStage("home"); }} />}

            {stage === "network-failed" && <div className={styles.copyBlock} role="alert"><p className={styles.kicker}>网络暂时中断</p><h1 id={titleId}>这一步还没有安全完成。</h1><p id="flow-description">{error}</p><div className={styles.actions}>{retryAction && <MemoryButton variant="primary" loading={busy} onClick={retryNetwork}>恢复后重试</MemoryButton>}<button className={styles.textButton} type="button" onClick={() => setStage("home")}>回到首页</button></div></div>}

            {stage === "preview-create" && <form className={styles.copyBlock} onSubmit={createPreview} noValidate><p className={styles.kicker}>纯视觉预览</p><h1 id={titleId}>TA 是谁？</h1><p id="flow-description">这段预览只展示前端节奏，提交不会连接认证、数据库、上传或聊天接口。</p><div className={styles.fieldGrid}><MemoryInput label="TA 的名字" value={name} onChange={(event: ChangeEvent<HTMLInputElement>) => setName(event.currentTarget.value)} autoFocus error={error || undefined} /><MemoryInput label="与你的关系" value={relationship} onChange={(event: ChangeEvent<HTMLInputElement>) => setRelationship(event.currentTarget.value)} /></div><div className={styles.actions}><MemoryButton type="submit">让 TA 出现</MemoryButton><button className={styles.textButton} type="button" onClick={() => setStage("home")}>退出预览</button></div></form>}

            {stage === "preview-generating" && <div className={styles.copyBlock} role="status" aria-live="polite"><p className={styles.kicker}>正在靠近</p><h1 id={titleId}>{displayName} 正在出现。</h1><p id="flow-description">仅展示视觉节奏；不代表真实资料、媒体或聊天服务已经生成。</p><div className={styles.progressLine} aria-hidden="true"><span /></div><button className={styles.textButton} type="button" onClick={() => { setError("视觉预览中的生成步骤未完成。真实资料与会话均未改变。"); setStage("preview-failed"); }}>查看生成失败状态</button></div>}

            {stage === "preview-greeting" && <div className={styles.copyBlock}><p className={styles.kicker}>视觉预览 · 第一句问候</p><h1 id={titleId}>你好，{displayName}。</h1><p className={styles.greeting} id="flow-description">“{greeting}”</p><div className={styles.actions}><MemoryButton variant="secondary" onClick={() => setStage("preview-create")}>重新预览</MemoryButton><button className={styles.textButton} type="button" onClick={() => setStage("home")}>退出预览</button></div></div>}

            {stage === "preview-failed" && <div className={styles.copyBlock} role="alert"><p className={styles.kicker}>视觉预览 · 生成失败</p><h1 id={titleId}>这次没有顺利出现。</h1><p id="flow-description">{error}</p><div className={styles.actions}>{!previewRetried && <MemoryButton variant="primary" onClick={retryPreviewGeneration}>再试一次</MemoryButton>}<button className={styles.textButton} type="button" onClick={() => setStage("preview-create")}>回到输入</button></div></div>}
          </section>
        </main>
        <footer className={styles.footer}><span>你的节奏，由你决定。</span><span>支持键盘操作与减少动态效果</span></footer>
      </div>
    </MemorySurface>
  );
}
