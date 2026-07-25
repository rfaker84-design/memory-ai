"use client";

import {
  ChangeEvent,
  FormEvent,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";

import { createMemoryRequestHeaders } from "../create-memory/createMemoryLogic";
import { MemoryAvatar, MemoryButton, MemoryInput, MemorySurface } from "../memory-ui";
import { MemoryMotion } from "../../design";
import { useReducedMotion } from "../../motion";

import { MemoryConversationScene } from "./MemoryConversationScene";
import { buildConfirmedMemoryProfile } from "./confirmedMemoryProfile";
import { loadOwnedMediaUrl } from "../memory/ownedMemoryClient";
import { recordTrustConsent, TrustConsentRequestError } from "../trust/trustConsentClient";
import styles from "./FirstPresenceFlow.module.css";

type EntryStage = "create" | "login-phone" | "preview-create";
type FlowStage =
  | "questions"
  | "login-phone"
  | "login-code"
  | "sms-unavailable"
  | "creating"
  | "upload-failed"
  | "reveal"
  | "conversation"
  | "network-failed"
  | "auth-required"
  | "preview-forming"
  | "preview-reveal"
  | "preview-greeting"
  | "preview-chat-one"
  | "preview-chat-two";
type AuthState = "checking" | "authenticated" | "unauthenticated" | "unavailable" | "preview";
type PendingUpload = { kind: "photo" | "voice"; file: File };
type ApiPayload = {
  error?: string;
  authenticated?: boolean;
  challengeId?: string;
  id?: string;
  name?: string;
  asset?: { id?: string; mediaType?: string };
};
type FirstPresenceFlowProps = {
  initialStage?: EntryStage;
  onLeaveHome?: () => void;
};

const QUESTION_COUNT = 9;
const VISUAL_PREVIEW_ENABLED =
  process.env.NODE_ENV !== "production"
  && process.env.NEXT_PUBLIC_MEMORYAI_ENABLE_PRESENCE_PREVIEW === "true";

async function responsePayload(response: Response): Promise<ApiPayload> {
  return response.json().catch(() => ({})) as Promise<ApiPayload>;
}

function clientIdempotencyKey() {
  const random = typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `presence-${random}`;
}

function initials(value: string) {
  return Array.from(value.trim() || "TA").slice(0, 2).join("");
}

function PresencePortrait({
  image,
  name,
  formation,
  revealed,
}: {
  image: string | null;
  name: string;
  formation: number;
  revealed: boolean;
}) {
  return (
    <div
      className={`${styles.portraitStage} ${revealed ? styles.portraitRevealed : ""}`}
      style={{ "--formation": formation } as React.CSSProperties}
      role="img"
      aria-label={image ? `${name} 的照片` : `${name} 的文字形象`}
    >
      <div className={styles.portraitGlow} aria-hidden="true" />
      <div className={styles.portraitFrame}>
        {image ? (
          <div className={styles.portraitPhoto} style={{ backgroundImage: `url("${image}")` }} />
        ) : (
          <span className={styles.portraitInitials}>{initials(name)}</span>
        )}
        <div className={styles.portraitShade} aria-hidden="true" />
      </div>
      <div className={styles.memoryMotes} aria-hidden="true"><i /><i /><i /><i /></div>
    </div>
  );
}

function PreviewConversation({
  name,
  portraitUrl,
  catchPhrase,
  speechStyle,
  sharedMemory,
  rounds,
}: {
  name: string;
  portraitUrl: string | null;
  catchPhrase: string;
  speechStyle: string;
  sharedMemory: string;
  rounds: 1 | 2;
}) {
  return (
    <div className={styles.previewConversation} aria-label={`两轮对话视觉预览，当前 ${rounds} 轮`}>
      <p className={styles.previewCaption}>对话示例 · 不调用聊天接口</p>
      <article className={styles.previewAssistant}>
        <MemoryAvatar image={portraitUrl} initials={name} alt={`${name} 的照片`} presence="online" size={38} />
        <p>{catchPhrase}</p>
      </article>
      <article className={styles.previewUser}><p>我又想起了{sharedMemory}</p></article>
      <article className={styles.previewAssistant}>
        <MemoryAvatar image={portraitUrl} initials={name} alt={`${name} 的照片`} presence="online" size={38} />
        <p>{speechStyle}</p>
      </article>
      {rounds === 2 && (
        <>
          <article className={styles.previewUser}><p>以后我还可以继续和你说这些吗？</p></article>
          <article className={styles.previewAssistant}>
            <MemoryAvatar image={portraitUrl} initials={name} alt={`${name} 的照片`} presence="online" size={38} />
            <p>可以。慢慢说，不用着急。</p>
          </article>
        </>
      )}
    </div>
  );
}

export function FirstPresenceFlow({
  initialStage = "create",
  onLeaveHome,
}: FirstPresenceFlowProps) {
  const reducedMotion = useReducedMotion();
  const previewMode = initialStage === "preview-create";
  const directLogin = initialStage === "login-phone";
  const [stage, setStage] = useState<FlowStage>(directLogin ? "login-phone" : "questions");
  const [questionIndex, setQuestionIndex] = useState(0);
  const [authState, setAuthState] = useState<AuthState>(previewMode ? "preview" : "checking");
  const [name, setName] = useState("");
  const [relationship, setRelationship] = useState("");
  const [preferredAddress, setPreferredAddress] = useState("");
  const [catchPhrases, setCatchPhrases] = useState("");
  const [speechStyle, setSpeechStyle] = useState("");
  const [sharedMemory, setSharedMemory] = useState("");
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [voiceFile, setVoiceFile] = useState<File | null>(null);
  const [portraitUrl, setPortraitUrl] = useState<string | null>(null);
  const [trustAccepted, setTrustAccepted] = useState(false);
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [challengeId, setChallengeId] = useState("");
  const [createdMemory, setCreatedMemory] = useState<{ id: string; name: string } | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const idempotencyKey = useRef<string | null>(null);
  const creationAttempted = useRef(false);
  const localPortraitUrl = useRef<string | null>(null);
  const uploadQueue = useRef<PendingUpload[]>([]);
  const uploadedPhotoAssetId = useRef<string | null>(null);
  const titleId = useId();

  const releaseLocalPortrait = useCallback(() => {
    if (localPortraitUrl.current) URL.revokeObjectURL(localPortraitUrl.current);
    localPortraitUrl.current = null;
  }, []);

  useEffect(() => () => releaseLocalPortrait(), [releaseLocalPortrait]);

  useEffect(() => {
    if (previewMode) return;
    const controller = new AbortController();
    void fetch("/api/auth/session", {
      cache: "no-store",
      credentials: "same-origin",
      signal: controller.signal,
    })
      .then(async (response) => {
        const payload = await responsePayload(response);
        if (controller.signal.aborted) return;
        if (response.ok && payload.authenticated) {
          setAuthState("authenticated");
          if (directLogin) setStage("questions");
        } else {
          setAuthState("unauthenticated");
          if (!directLogin) setStage("auth-required");
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) setAuthState("unavailable");
      });
    return () => controller.abort();
  }, [directLogin, previewMode]);

  useEffect(() => {
    if (stage !== "preview-forming") return;
    const timer = window.setTimeout(
      () => setStage("preview-reveal"),
      reducedMotion ? 80 : 1450,
    );
    return () => window.clearTimeout(timer);
  }, [reducedMotion, stage]);

  const displayName = name.trim() || "TA";
  const formation = stage === "reveal"
    || stage === "conversation"
    || stage.startsWith("preview-") && stage !== "preview-forming"
    ? 1
    : Math.max(0.12, (questionIndex + 1) / QUESTION_COUNT);
  const revealed = stage === "reveal"
    || stage === "conversation"
    || stage === "preview-reveal"
    || stage === "preview-greeting"
    || stage === "preview-chat-one"
    || stage === "preview-chat-two";

  const noteDraftRevision = () => {
    setError("");
    if (!creationAttempted.current) return;
    creationAttempted.current = false;
    idempotencyKey.current = null;
    uploadQueue.current = [];
    uploadedPhotoAssetId.current = null;
    setCreatedMemory(null);
  };

  const leaveFlow = () => {
    if (onLeaveHome) onLeaveHome();
    else window.location.assign("/");
  };

  const sendCode = async () => {
    if (!/^1\d{10}$/.test(phone.trim())) {
      setError("请输入有效的中国大陆手机号。");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/auth/send-code", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: phone.trim() }),
      });
      const payload = await responsePayload(response);
      if (response.status === 503) {
        setError("短信登录暂未开放。当前不会创建会话、TA 资料或任何素材。");
        setStage("sms-unavailable");
        return;
      }
      if (!response.ok || !payload.challengeId) {
        setError(response.status === 429 ? "请求过于频繁，请稍后再试。" : "暂时无法发送验证码，请检查号码后重试。");
        return;
      }
      setChallengeId(payload.challengeId);
      setCode("");
      setStage("login-code");
    } catch {
      setError("网络连接中断，验证码尚未发送。系统不会自动重试。");
    } finally {
      setBusy(false);
    }
  };

  const verifyCode = async () => {
    if (!challengeId || !/^\d{6}$/.test(code.trim())) {
      setError("请输入 6 位短信验证码。");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/auth/verify-code", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: phone.trim(), challengeId, code: code.trim() }),
      });
      const payload = await responsePayload(response);
      if (!response.ok || !payload.authenticated) {
        setError("验证码无效或已过期，请重新获取。");
        return;
      }
      const sessionResponse = await fetch("/api/auth/session", {
        cache: "no-store",
        credentials: "same-origin",
      });
      const sessionPayload = await responsePayload(sessionResponse);
      const authenticated = sessionResponse.ok && Boolean(sessionPayload.authenticated);
      if (!authenticated) {
        setError("登录状态未能确认，请重新验证短信。");
        setStage("login-phone");
        return;
      }
      setAuthState("authenticated");
      setStage("questions");
    } catch {
      setError("网络连接中断，尚未建立登录会话。系统不会自动重试。");
    } finally {
      setBusy(false);
    }
  };

  const reviseText = (setter: (value: string) => void, value: string) => {
    noteDraftRevision();
    setter(value);
  };

  const chooseMedia = (kind: "photo" | "voice", event: ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0] ?? null;
    const valid = kind === "photo" ? file?.type.startsWith("image/") : file?.type.startsWith("audio/");
    if (file && (!valid || file.size > 20 * 1024 * 1024)) {
      setError("请选择 20MB 以内的照片或声音文件。");
      return;
    }
    noteDraftRevision();
    if (kind === "photo") {
      releaseLocalPortrait();
      setPhotoFile(file);
      if (file) {
        const url = URL.createObjectURL(file);
        localPortraitUrl.current = url;
        setPortraitUrl(url);
      } else {
        setPortraitUrl(null);
      }
    } else {
      setVoiceFile(file);
    }
  };

  const validationMessage = () => {
    const required = [
      [name, "请先写下 TA 的名字。"],
      [relationship, "请写下 TA 与你的关系。"],
      [preferredAddress, "请写下 TA 平时如何称呼你。"],
      [catchPhrases, "请写下一句 TA 真实常说的话。"],
      [speechStyle, "请描述 TA 真实的说话习惯。"],
      [sharedMemory, "请写下一段你确认真实发生过的共同回忆。"],
    ] as const;
    if (questionIndex <= 5 && !required[questionIndex][0].trim()) {
      return required[questionIndex][1];
    }
    if (questionIndex === 8 && !trustAccepted) {
      return "请先确认 AI 身份、素材权利、隐私处理与成年要求。";
    }
    return "";
  };

  const uploadPendingMedia = async (memory: { id: string; name: string }) => {
    if (!uploadQueue.current.length && !uploadedPhotoAssetId.current) return;
    await recordTrustConsent("media_asset", memory.id);

    if (uploadedPhotoAssetId.current && !portraitUrl?.startsWith("http")) {
      const signedUrl = await loadOwnedMediaUrl(uploadedPhotoAssetId.current);
      releaseLocalPortrait();
      setPortraitUrl(signedUrl);
    }

    while (uploadQueue.current.length) {
      const pending = uploadQueue.current[0];
      const form = new FormData();
      form.append("file", pending.file);
      form.append("memoryId", memory.id);
      const response = await fetch("/api/media/upload", {
        method: "POST",
        credentials: "same-origin",
        body: form,
      });
      const payload = await responsePayload(response);
      if (!response.ok || !payload.asset?.id) {
        throw new Error(response.status === 401 ? "AUTH_EXPIRED" : "MEDIA_UPLOAD_FAILED");
      }
      uploadQueue.current.shift();
      if (pending.kind === "photo") {
        uploadedPhotoAssetId.current = payload.asset.id;
        releaseLocalPortrait();
        setPortraitUrl(null);
        const signedUrl = await loadOwnedMediaUrl(payload.asset.id);
        setPortraitUrl(signedUrl);
      }
    }
  };

  const createRealPresence = async () => {
    if (authState === "checking") {
      setError("仍在确认登录状态，请稍后再继续。");
      return;
    }
    if (authState !== "authenticated") {
      setStage("auth-required");
      return;
    }

    setBusy(true);
    setError("");
    setStage("creating");
    creationAttempted.current = true;
    if (!uploadQueue.current.length && !createdMemory) {
      uploadQueue.current = [
        ...(photoFile ? [{ kind: "photo" as const, file: photoFile }] : []),
        ...(voiceFile ? [{ kind: "voice" as const, file: voiceFile }] : []),
      ];
    }

    try {
      await recordTrustConsent("memory_profile");
      idempotencyKey.current ||= clientIdempotencyKey();
      const response = await fetch("/api/memories", {
        method: "POST",
        credentials: "same-origin",
        headers: createMemoryRequestHeaders(idempotencyKey.current),
        body: JSON.stringify({
          name: name.trim(),
          relationship: relationship.trim(),
          ...buildConfirmedMemoryProfile({
            preferredAddress,
            catchPhrases,
            speechStyle,
            sharedMemory,
          }),
        }),
      });
      const payload = await responsePayload(response);
      if (response.status === 401) {
        setAuthState("unauthenticated");
        setStage("auth-required");
        return;
      }
      if (!response.ok || !payload.id) {
        setError("TA 的资料尚未得到服务器确认。已保留全部回答，不会自动重试。");
        setStage("network-failed");
        return;
      }

      const memory = { id: payload.id, name: payload.name || name.trim() };
      setCreatedMemory(memory);
      try {
        await uploadPendingMedia(memory);
        setStage("reveal");
      } catch (cause) {
        setError(cause instanceof Error && cause.message === "AUTH_EXPIRED"
          ? "登录状态已失效；素材尚未继续上传。重新登录后可明确重试。"
          : "TA 的资料已经创建，但仍有素材未安全上传。已保留文件与回答，不会自动重试。");
        setStage("upload-failed");
      }
    } catch (cause) {
      setError(cause instanceof TrustConsentRequestError
        ? "必要确认尚未安全记录，TA 资料与素材均未继续写入。已保留全部回答。"
        : "网络连接中断，无法确认 TA 是否已经创建。已保留全部回答与原幂等键，不会自动重发。");
      setStage("network-failed");
    } finally {
      setBusy(false);
    }
  };

  const retryUpload = async () => {
    if (!createdMemory || busy) return;
    setBusy(true);
    setError("");
    try {
      await uploadPendingMedia(createdMemory);
      setStage("reveal");
    } catch {
      setError("素材仍未安全上传。文件和已创建的 TA 资料都保持不变，请稍后明确重试。");
    } finally {
      setBusy(false);
    }
  };

  const continueWithoutPendingMedia = () => {
    uploadQueue.current = [];
    if (!uploadedPhotoAssetId.current) {
      releaseLocalPortrait();
      setPortraitUrl(null);
    }
    setError("");
    setStage("reveal");
  };

  const submitQuestion = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const validation = validationMessage();
    if (validation) {
      setError(validation);
      return;
    }
    setError("");
    if (questionIndex < QUESTION_COUNT - 1) {
      setQuestionIndex((current) => current + 1);
      return;
    }
    if (previewMode && VISUAL_PREVIEW_ENABLED) {
      setStage("preview-forming");
      return;
    }
    void createRealPresence();
  };

  const goBack = () => {
    setError("");
    if (questionIndex > 0) {
      setQuestionIndex((current) => current - 1);
      return;
    }
    onLeaveHome?.();
  };

  const previewGreeting = `${preferredAddress}，${catchPhrases}`;
  const stageLabel = stage === "questions"
    ? `第 ${questionIndex + 1} / ${QUESTION_COUNT} 次回应`
    : stage === "creating"
      ? "等待服务器确认"
      : stage === "reveal" || stage === "preview-reveal"
        ? "人物出现"
      : stage === "conversation"
          ? "持续对话"
          : stage === "login-phone" || stage === "login-code" || stage === "sms-unavailable"
            ? "安全短信登录"
          : previewMode
            ? "视觉预览"
            : "安全恢复";

  const question = (() => {
    switch (questionIndex) {
      case 0:
        return {
          kicker: "身份",
          title: "你想再次遇见谁？",
          description: "先写下 TA 的名字。每次只回答一个问题，你随时可以返回修改。",
          control: <MemoryInput label="TA 的名字" value={name} onChange={(event: ChangeEvent<HTMLInputElement>) => reviseText(setName, event.currentTarget.value)} autoFocus error={error || undefined} />,
        };
      case 1:
        return {
          kicker: "身份",
          title: `${displayName}，与你是什么关系？`,
          description: "只写你确认真实的关系。我们不会替你补全没有说过的身份。",
          control: <MemoryInput label="TA 与我的关系" value={relationship} onChange={(event: ChangeEvent<HTMLInputElement>) => reviseText(setRelationship, event.currentTarget.value)} autoFocus error={error || undefined} />,
        };
      case 2:
        return {
          kicker: "你们之间",
          title: `${displayName}平时如何称呼你？`,
          description: "例如“小雨”“闺女”或你们之间独有的称呼。这会进入正式 Memory 契约。",
          control: <MemoryInput label="TA 如何称呼我" value={preferredAddress} onChange={(event: ChangeEvent<HTMLInputElement>) => reviseText(setPreferredAddress, event.currentTarget.value)} autoFocus error={error || undefined} />,
        };
      case 3:
        return {
          kicker: "一句熟悉的话",
          title: `${displayName}最常说哪句话？`,
          description: "写下真实说过的话。正式第一句问候只会使用服务器保存并确认的资料。",
          control: <MemoryInput multiline label="TA 常说的一句话" value={catchPhrases} onChange={(event: ChangeEvent<HTMLTextAreaElement>) => reviseText(setCatchPhrases, event.currentTarget.value)} autoFocus error={error || undefined} />,
        };
      case 4:
        return {
          kicker: "说话的样子",
          title: `${displayName}说话时，有什么习惯？`,
          description: "比如语速、语气、常用停顿。不要写你不确定的性格或经历。",
          control: <MemoryInput multiline label="TA 的说话习惯" value={speechStyle} onChange={(event: ChangeEvent<HTMLTextAreaElement>) => reviseText(setSpeechStyle, event.currentTarget.value)} autoFocus error={error || undefined} />,
        };
      case 5:
        return {
          kicker: "共同回忆",
          title: "哪一段记忆，你想先告诉 TA？",
          description: "写下一件你确认真实发生过的事。它会成为服务端首次问候与后续对话的背景。",
          control: <MemoryInput multiline label="一段共同回忆" value={sharedMemory} onChange={(event: ChangeEvent<HTMLTextAreaElement>) => reviseText(setSharedMemory, event.currentTarget.value)} autoFocus error={error || undefined} />,
        };
      case 6:
        return {
          kicker: "一张照片",
          title: `让${displayName}先被看见。`,
          description: "照片只用于人物出现、首次问候和聊天头像。正式流程会在 TA 创建后上传并绑定同一 Memory；没有照片时才使用文字形象。",
          control: <label className={styles.mediaChoice}>选择 TA 的照片<span>{photoFile?.name || "JPG、PNG 等，最大 20MB；可暂不上传"}</span><input aria-label="选择 TA 的照片" type="file" accept="image/*" onChange={(event) => chooseMedia("photo", event)} /></label>,
        };
      case 7:
        return {
          kicker: "一段声音 · 可选",
          title: "你有一段真实声音吗？",
          description: "本版本只保存你有权使用的原始声音素材，不克隆声音、不生成口型。没有声音仍可继续创建。",
          control: <label className={styles.mediaChoice}>选择真实声音<span>{voiceFile?.name || "常见音频格式，最大 20MB；不上传也可继续"}</span><input aria-label="选择真实声音" type="file" accept="audio/*" onChange={(event) => chooseMedia("voice", event)} /></label>,
        };
      default:
        return {
          kicker: "最后一次确认",
          title: `这些真实资料，可以交给忆见吗？`,
          description: "忆见展示的是 AI 生成内容，不是现实中的 TA，也不是数字人或医疗服务。",
          control: (
            <div className={styles.consentBlock}>
              <p>照片和声音只在正式创建后上传，并绑定你拥有的同一 TA。请阅读 <a href="/privacy">隐私政策</a>、<a href="/terms">用户协议</a> 与 <a href="/authorization">AI 内容和素材说明</a>。数据删除入口位于 <a href="/report">投诉与删除</a>。</p>
              <label className={styles.trustCheck}>
                <input type="checkbox" checked={trustAccepted} onChange={(event) => { noteDraftRevision(); setTrustAccepted(event.currentTarget.checked); }} />
                <span>我已年满 18 周岁，理解 AI 身份与资料处理方式，并确认拥有上述内容、照片和声音的合法使用权。</span>
              </label>
            </div>
          ),
        };
    }
  })();

  return (
    <MemorySurface
      variant="background"
      className={`${styles.scene} ${reducedMotion ? styles.reduced : ""}`}
      style={{
        "--motion-duration": `${reducedMotion ? 0 : MemoryMotion.duration.enter}ms`,
        "--formation": formation,
      } as React.CSSProperties}
    >
      <div className={styles.starField} aria-hidden="true" />
      <div className={styles.frame}>
        <header className={styles.header}>
          <button className={styles.wordmark} type="button" onClick={leaveFlow} aria-label="回到忆见登录页">忆见 <span>memoryai</span></button>
          <span className={styles.step} aria-live="polite">{stageLabel}</span>
        </header>

        {stage === "conversation" && createdMemory && idempotencyKey.current ? (
          <main className={styles.conversationMain}>
            <MemoryConversationScene
              memoryId={createdMemory.id}
              memoryName={createdMemory.name}
              firstGreetingKey={idempotencyKey.current}
              initialPortraitUrl={portraitUrl}
              onLeave={() => {
                idempotencyKey.current = null;
                setCreatedMemory(null);
                onLeaveHome?.();
              }}
            />
          </main>
        ) : (
          <main className={styles.main} aria-labelledby={titleId}>
            <section className={styles.presenceStage} aria-label="TA 正在同一记忆空间中逐渐形成">
              <div className={styles.lightColumn} aria-hidden="true" />
              <div className={styles.memoryRing} aria-hidden="true" />
              <PresencePortrait image={portraitUrl} name={displayName} formation={formation} revealed={revealed} />
              <p className={styles.presenceName}>{revealed ? displayName : questionIndex < 1 ? "一个熟悉的轮廓" : displayName}</p>
              {stage === "questions" && <p className={styles.formationNote}>已回应 {questionIndex} 段真实资料 · 画面只随你的输入变化</p>}
            </section>

            <section className={`${styles.controlShell} ${revealed ? styles.controlAfterReveal : ""}`} aria-describedby="flow-description">
              {previewMode && <p className={styles.previewNotice}>视觉预览 · 零网络写入 · 不代表真实生成、真实聊天或数字人</p>}

              {stage === "login-phone" && (
                <form className={styles.copyBlock} onSubmit={(event) => { event.preventDefault(); void sendCode(); }} noValidate>
                  <p className={styles.kicker}>真实短信登录</p>
                  <h1 id={titleId}>先确认，是你。</h1>
                  <p id="flow-description">验证码只由服务器验证并设置 HttpOnly 会话。登录成功后仍停留在同一记忆空间。</p>
                  <MemoryInput label="手机号" type="tel" inputMode="numeric" autoComplete="tel" value={phone} onChange={(event: ChangeEvent<HTMLInputElement>) => setPhone(event.currentTarget.value)} autoFocus error={error || undefined} />
                  <div className={styles.actions}><button className={styles.backButton} type="button" onClick={leaveFlow}>返回</button><MemoryButton type="submit" loading={busy}>发送验证码</MemoryButton></div>
                </form>
              )}

              {stage === "login-code" && (
                <form className={styles.copyBlock} onSubmit={(event) => { event.preventDefault(); void verifyCode(); }} noValidate>
                  <p className={styles.kicker}>验证短信</p>
                  <h1 id={titleId}>输入 6 位验证码。</h1>
                  <p id="flow-description">服务端确认会话以后，才会进入 TA 的第一道问题。</p>
                  <MemoryInput label="短信验证码" type="text" inputMode="numeric" autoComplete="one-time-code" value={code} onChange={(event: ChangeEvent<HTMLInputElement>) => setCode(event.currentTarget.value)} autoFocus error={error || undefined} />
                  <div className={styles.actions}><button className={styles.backButton} type="button" onClick={() => setStage("login-phone")}>更换号码</button><MemoryButton type="submit" loading={busy}>验证并继续</MemoryButton></div>
                </form>
              )}

              {stage === "sms-unavailable" && (
                <div className={styles.copyBlock} role="alert">
                  <p className={styles.kicker}>短信暂未开放</p>
                  <h1 id={titleId}>这次不能安全登录。</h1>
                  <p id="flow-description">{error}</p>
                  <div className={styles.actions}><button className={styles.backButton} type="button" onClick={leaveFlow}>回到首页</button><MemoryButton onClick={() => setStage("login-phone")}>稍后重试</MemoryButton></div>
                </div>
              )}

              {stage === "questions" && (
                <form className={styles.copyBlock} onSubmit={submitQuestion} noValidate>
                  <p className={styles.kicker}>{question.kicker}</p>
                  <h1 id={titleId}>{question.title}</h1>
                  <p id="flow-description">{question.description}</p>
                  <div className={styles.singleQuestion} key={questionIndex}>{question.control}</div>
                  {error && <p className={styles.error} role="alert">{error}</p>}
                  {authState === "checking" && !previewMode && <p className={styles.inlineStatus} role="status">正在确认登录保护；你的回答仍只保留在当前页面。</p>}
                  <div className={styles.actions}>
                    <button className={styles.backButton} type="button" onClick={goBack}>返回</button>
                    <MemoryButton type="submit">{questionIndex === QUESTION_COUNT - 1 ? (previewMode ? "进入视觉预览" : "确认并创建 TA") : "继续"}</MemoryButton>
                  </div>
                </form>
              )}

              {stage === "creating" && (
                <div className={styles.copyBlock} role="status" aria-live="polite">
                  <p className={styles.kicker}>等待服务器确认</p>
                  <h1 id={titleId}>正在保存你刚刚确认的资料。</h1>
                  <p id="flow-description">这里不显示虚假百分比。只有 Memory 和素材接口真实确认后，人物才会出现。</p>
                  <div className={styles.waitingPulse} aria-hidden="true"><i /><i /><i /></div>
                </div>
              )}

              {stage === "upload-failed" && (
                <div className={styles.copyBlock} role="alert">
                  <p className={styles.kicker}>素材仍在原地</p>
                  <h1 id={titleId}>TA 已创建，照片或声音尚未完整上传。</h1>
                  <p id="flow-description">{error}</p>
                  <div className={styles.actions}>
                    <MemoryButton loading={busy} onClick={() => void retryUpload()}>明确重试素材上传</MemoryButton>
                    <button className={styles.backButton} type="button" onClick={continueWithoutPendingMedia}>暂时不用这些素材</button>
                  </div>
                </div>
              )}

              {stage === "network-failed" && (
                <div className={styles.copyBlock} role="alert">
                  <p className={styles.kicker}>连接暂时中断</p>
                  <h1 id={titleId}>没有替你重复这一步。</h1>
                  <p id="flow-description">{error}</p>
                  <div className={styles.actions}>
                    <MemoryButton loading={busy} onClick={() => void createRealPresence()}>使用原幂等键重试</MemoryButton>
                    <button className={styles.backButton} type="button" onClick={() => { setError(""); setQuestionIndex(8); setStage("questions"); }}>返回检查回答</button>
                  </div>
                </div>
              )}

              {stage === "auth-required" && (
                <div className={styles.copyBlock} role="alert">
                  <p className={styles.kicker}>登录保护</p>
                  <h1 id={titleId}>需要重新确认登录。</h1>
                  <p id="flow-description">没有写入 Memory、素材、问候、聊天或支付数据。已填写内容仍保留在当前页面。</p>
                  <div className={styles.actions}><MemoryButton onClick={leaveFlow}>回到登录页</MemoryButton></div>
                </div>
              )}

              {stage === "reveal" && (
                <div className={`${styles.copyBlock} ${styles.revealCopy}`}>
                  <p className={styles.kicker}>人物出现</p>
                  <h1 id={titleId}>{displayName}，来到这里了。</h1>
                  <p id="flow-description">{portraitUrl ? "这里呈现的是你上传并由服务端签名返回的真实照片，不是数字人或生成口型。" : "你没有上传照片，因此这里使用文字形象；不会伪造一张脸。"}</p>
                  <div className={styles.revealActions}><MemoryButton onClick={() => setStage("conversation")}>听听第一句问候</MemoryButton></div>
                </div>
              )}

              {stage === "preview-forming" && (
                <div className={styles.copyBlock} role="status" aria-live="polite">
                  <p className={styles.kicker}>同一场景正在靠近</p>
                  <h1 id={titleId}>你确认的资料，正在汇到一个画面。</h1>
                  <p id="flow-description">这是本地视觉过渡，不是生成进度；没有调用认证、Memory、上传、问候、聊天或支付接口。</p>
                  <div className={styles.waitingPulse} aria-hidden="true"><i /><i /><i /></div>
                </div>
              )}

              {stage === "preview-reveal" && (
                <div className={`${styles.copyBlock} ${styles.revealCopy}`}>
                  <p className={styles.kicker}>人物出现 · 视觉预览</p>
                  <h1 id={titleId}>{displayName}，先被你看见。</h1>
                  <p id="flow-description">{portraitUrl ? "照片仍是本地选择的预览文件，没有上传；这不是数字人或真实生成。" : "未选择照片，因此仅显示文字形象。"}</p>
                  <div className={styles.revealActions}><MemoryButton onClick={() => setStage("preview-greeting")}>查看问候示例</MemoryButton></div>
                </div>
              )}

              {stage === "preview-greeting" && (
                <div className={styles.copyBlock}>
                  <p className={styles.kicker}>首次问候示例 · 不调用接口</p>
                  <h1 id={titleId}>{previewGreeting}</h1>
                  <p id="flow-description">这句只用于验证称呼、口头禅、说话方式和共同回忆的视觉呈现。正式问候必须由现有 first-greeting 接口返回。</p>
                  <div className={styles.previewGreetingAvatar}><MemoryAvatar image={portraitUrl} initials={displayName} alt={`${displayName} 的照片`} presence="online" size={46} /><span>{speechStyle}</span></div>
                  <div className={styles.actions}><MemoryButton onClick={() => setStage("preview-chat-one")}>继续第一轮对话</MemoryButton></div>
                </div>
              )}

              {stage === "preview-chat-one" && (
                <div className={styles.copyBlock}>
                  <p className={styles.kicker}>情绪体验 · 第 1 / 2 轮</p>
                  <h1 id={titleId}>慢慢说，我在听。</h1>
                  <PreviewConversation name={displayName} portraitUrl={portraitUrl} catchPhrase={catchPhrases} speechStyle={speechStyle} sharedMemory={sharedMemory} rounds={1} />
                  <div className={styles.actions}><MemoryButton onClick={() => setStage("preview-chat-two")}>继续第二轮对话</MemoryButton></div>
                </div>
              )}

              {stage === "preview-chat-two" && (
                <div className={styles.copyBlock}>
                  <p className={styles.kicker}>情绪体验 · 已完成两轮</p>
                  <h1 id={titleId}>回应之后，再决定要不要继续。</h1>
                  <PreviewConversation name={displayName} portraitUrl={portraitUrl} catchPhrase={catchPhrases} speechStyle={speechStyle} sharedMemory={sharedMemory} rounds={2} />
                  <div className={styles.previewOffer} aria-label="49元购买入口视觉预览">
                    <span>购买入口视觉预览 · 不创建订单</span>
                    <strong>忆见初遇体验</strong>
                    <p>49元 · 30天 · 1个 TA · 100次 AI 回复</p>
                    <small>一次性购买，不自动续费。正式流程会继续展示退款条件与必要确认。</small>
                  </div>
                  <div className={styles.actions}><button className={styles.backButton} type="button" onClick={leaveFlow}>结束视觉预览</button></div>
                </div>
              )}
            </section>
          </main>
        )}

        <footer className={styles.footer}><span>人物先出现，操作随后到来。</span><span>支持返回、键盘与减少动态效果</span></footer>
      </div>
    </MemorySurface>
  );
}
