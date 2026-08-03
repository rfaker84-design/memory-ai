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
import { useRouter } from "next/navigation";

import { createMemoryRequestHeaders } from "../create-memory/createMemoryLogic";
import { MemoryAvatar, MemoryButton, MemoryInput, MemorySurface } from "../memory-ui";
import { MemoryMotion } from "../../design";
import { useReducedMotion } from "../../motion";

import { buildConfirmedMemoryProfile } from "./confirmedMemoryProfile";
import { recordTrustConsent, TrustConsentRequestError } from "../trust/trustConsentClient";
import {
  clearCreationRecovery,
  fetchCreationRequest,
  readCreationRecovery,
  recoverPendingCreation,
  uploadCurrentCreationMedia,
  writeCreationRecovery,
} from "./creationRecoveryClient";
import styles from "./FirstPresenceFlow.module.css";
import { AiGeneratedLabel } from "../safety/AiGeneratedLabel";
import { resolveSmsLoginAction } from "../auth/loginExperienceClient";
import { fetchAuthRequest } from "../auth/authRequestClient";

type EntryStage = "create" | "login-phone" | "preview-create";
type FlowStage =
  | "questions"
  | "login-phone"
  | "login-code"
  | "sms-unavailable"
  | "creating"
  | "network-failed"
  | "auth-required"
  | "preview-forming"
  | "preview-reveal"
  | "preview-greeting"
  | "preview-chat-one";
type AuthState = "checking" | "authenticated" | "unauthenticated" | "unavailable" | "preview";
type ApiPayload = {
  error?: string;
  authenticated?: boolean;
  challengeId?: string;
  id?: string;
  name?: string;
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
  fragments,
}: {
  image: string | null;
  name: string;
  formation: number;
  revealed: boolean;
  fragments: string[];
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
      <div className={styles.memoryFragments} aria-hidden="true">
        {fragments.slice(-4).map((fragment, index) => (
          <span
            className={styles.memoryFragment}
            key={`${fragment}-${index}`}
            style={{ "--fragment-index": index } as React.CSSProperties}
          >
            {fragment}
          </span>
        ))}
      </div>
      <div className={styles.memoryMotes} aria-hidden="true"><i /><i /><i /><i /></div>
    </div>
  );
}

function SceneField({
  label,
  value,
  onChange,
  multiline = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  multiline?: boolean;
}) {
  return (
    <label className={styles.sceneField}>
      <span>{label}</span>
      {multiline ? (
        <textarea
          value={value}
          onChange={(event) => onChange(event.currentTarget.value)}
          autoFocus
          rows={3}
        />
      ) : (
        <input
          value={value}
          onChange={(event) => onChange(event.currentTarget.value)}
          autoFocus
        />
      )}
    </label>
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
    <div className={styles.previewConversation} aria-label="与 TA 的对话">
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
  const router = useRouter();
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
  const [loginAgreementAccepted, setLoginAgreementAccepted] = useState(false);
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [challengeId, setChallengeId] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const idempotencyKey = useRef<string | null>(null);
  const recoveryCheckStarted = useRef(false);
  const creationOperationInFlight = useRef(false);
  const conversationNavigationCommitted = useRef(false);
  const localPortraitUrl = useRef<string | null>(null);
  const titleId = useId();

  const releaseLocalPortrait = useCallback(() => {
    if (localPortraitUrl.current) URL.revokeObjectURL(localPortraitUrl.current);
    localPortraitUrl.current = null;
  }, []);

  useEffect(() => () => releaseLocalPortrait(), [releaseLocalPortrait]);

  useEffect(() => {
    if (previewMode) return;
    const controller = new AbortController();
    void fetchAuthRequest("/api/auth/session", {
      cache: "no-store",
      credentials: "same-origin",
    }, fetch, controller.signal)
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
  const formation = stage.startsWith("preview-") && stage !== "preview-forming"
    ? 1
    : Math.max(0.1, (questionIndex + 1) / QUESTION_COUNT);
  const revealed = stage === "preview-reveal"
    || stage === "preview-greeting"
    || stage === "preview-chat-one";
  const memoryFragments = [
    questionIndex > 0 && name.trim(),
    questionIndex > 1 && relationship.trim(),
    questionIndex > 2 && preferredAddress.trim() ? `“${preferredAddress.trim()}”` : "",
    questionIndex > 3 && catchPhrases.trim() ? `“${catchPhrases.trim()}”` : "",
    questionIndex > 4 && speechStyle.trim(),
    questionIndex > 5 && sharedMemory.trim(),
  ].filter((fragment): fragment is string => Boolean(fragment));

  const noteDraftRevision = () => {
    setError("");
  };

  const leaveFlow = () => {
    if (onLeaveHome) onLeaveHome();
    else window.location.assign("/");
  };

  const sendCode = async () => {
    const loginAction = resolveSmsLoginAction(loginAgreementAccepted);
    if (loginAction.type === "notice") {
      setError(loginAction.message);
      return;
    }
    if (!/^1\d{10}$/.test(phone.trim())) {
      setError("请输入有效的中国大陆手机号。");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const response = await fetchAuthRequest("/api/auth/send-code", {
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
    const loginAction = resolveSmsLoginAction(loginAgreementAccepted);
    if (loginAction.type === "notice") {
      setError(loginAction.message);
      return;
    }
    if (!challengeId || !/^\d{6}$/.test(code.trim())) {
      setError("请输入 6 位短信验证码。");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const response = await fetchAuthRequest("/api/auth/verify-code", {
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
      const sessionResponse = await fetchAuthRequest("/api/auth/session", {
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
      setError("网络连接中断，登录结果尚未确认。系统不会自动重试；请重新验证或刷新后确认。");
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

  const completeCreatedMemory = useCallback(async (memoryId: string, key: string) => {
    await uploadCurrentCreationMedia({
      memoryId,
      idempotencyKey: key,
      files: {
        ...(photoFile ? { photo: photoFile } : {}),
        ...(voiceFile ? { voice: voiceFile } : {}),
      },
    });
    if (conversationNavigationCommitted.current) return;
    conversationNavigationCommitted.current = true;
    router.replace(`/memory-chat/${encodeURIComponent(memoryId)}`);
  }, [photoFile, router, voiceFile]);

  const continueRecoveredCreation = useCallback(async (unknownAfterRefresh = false) => {
    if (creationOperationInFlight.current) return;
    creationOperationInFlight.current = true;
    setBusy(true);
    setError("");
    setStage("creating");
    try {
      const result = await recoverPendingCreation();
      if (result.status === "none") {
        setError("刚才的创建记录已经不在当前页面中。请返回确认后再继续。");
        setQuestionIndex(8);
        setStage("questions");
        return;
      }
      if (result.status === "unauthenticated") {
        setAuthState("unauthenticated");
        router.replace("/login");
        return;
      }
      if (result.status === "not-found") {
        idempotencyKey.current = result.record.idempotencyKey;
        setError("暂时还不能确认 TA 是否已经保存。系统不会改用新的创建标识，也不会重复创建；请稍后由你再次确认。");
        setStage("network-failed");
        return;
      }
      if (result.status === "known") {
        idempotencyKey.current = result.record.idempotencyKey;
        if (photoFile || voiceFile) {
          await completeCreatedMemory(result.memoryId, result.record.idempotencyKey);
          return;
        }
        router.replace(`/memory-chat/${encodeURIComponent(result.memoryId)}`);
        return;
      }

      idempotencyKey.current = result.record.idempotencyKey;
      if (photoFile || voiceFile || !unknownAfterRefresh) {
        await completeCreatedMemory(result.memory.id, result.record.idempotencyKey);
        return;
      }
      if (!writeCreationRecovery({
        idempotencyKey: result.record.idempotencyKey,
        memoryId: result.memory.id,
        phase: "media-pending",
      })) {
        setError("TA 已经保存，但当前页面暂时无法保留后续素材状态。请不要关闭页面，稍后再次确认。");
        setStage("network-failed");
        return;
      }
      router.replace(`/memory-chat/${encodeURIComponent(result.memory.id)}`);
    } catch {
      setError("刚才的素材还没有得到服务端保存确认。系统不会重复创建 TA，也不会进入对话；请稍后由你再次确认。");
      setStage("network-failed");
    } finally {
      creationOperationInFlight.current = false;
      setBusy(false);
    }
  }, [completeCreatedMemory, photoFile, router, voiceFile]);

  const createRealPresence = async () => {
    if (creationOperationInFlight.current) return;
    if (authState === "checking") {
      setError("仍在确认登录状态，请稍后再继续。");
      return;
    }
    if (authState !== "authenticated") {
      setStage("auth-required");
      return;
    }

    const pendingRecovery = readCreationRecovery();
    if (pendingRecovery) {
      idempotencyKey.current = pendingRecovery.idempotencyKey;
      await continueRecoveredCreation();
      return;
    }

    setBusy(true);
    creationOperationInFlight.current = true;
    setError("");
    setStage("creating");

    try {
      await recordTrustConsent("adult_eligibility");
      await recordTrustConsent("memory_profile");
      idempotencyKey.current ||= clientIdempotencyKey();
      if (!writeCreationRecovery({
        idempotencyKey: idempotencyKey.current,
        phase: "creating",
      })) {
        setError("当前浏览器无法安全保留这次创建状态，因此尚未提交。请保持页面打开并稍后重试。");
        setStage("network-failed");
        return;
      }
      const response = await fetchCreationRequest("/api/memories", {
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
        clearCreationRecovery();
        setAuthState("unauthenticated");
        router.replace("/login");
        return;
      }
      if (!response.ok || !payload.id) {
        setError("还不能确认 TA 是否已经保存。系统不会重复创建；请稍后由你再次确认。");
        setStage("network-failed");
        return;
      }

      await completeCreatedMemory(payload.id, idempotencyKey.current);
    } catch (cause) {
      if (cause instanceof TrustConsentRequestError) {
        setError("刚才的确认还没有保存好。你的回答都还在这里。");
        setQuestionIndex(8);
        setStage("questions");
      } else {
        setError("刚才的素材还没有得到服务端保存确认。系统不会重复创建 TA，也不会进入对话；请稍后由你再次确认。");
        setStage("network-failed");
      }
    } finally {
      creationOperationInFlight.current = false;
      setBusy(false);
    }
  };

  useEffect(() => {
    if (
      previewMode
      || authState !== "authenticated"
      || recoveryCheckStarted.current
      || !readCreationRecovery()
    ) {
      return;
    }
    recoveryCheckStarted.current = true;
    void continueRecoveredCreation(true);
  }, [authState, continueRecoveredCreation, previewMode]);

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
  const question = (() => {
    switch (questionIndex) {
      case 0:
        return {
          kicker: "身份",
          title: "你想再次遇见谁？",
          description: "先写下 TA 的名字。你随时可以返回修改。",
          control: <SceneField label="TA 的名字" value={name} onChange={(value) => reviseText(setName, value)} />,
        };
      case 1:
        return {
          kicker: "身份",
          title: `${displayName}，与你是什么关系？`,
          description: "只写你确认真实的关系。这里不会替你补全没有说过的身份。",
          control: <SceneField label="TA 与我的关系" value={relationship} onChange={(value) => reviseText(setRelationship, value)} />,
        };
      case 2:
        return {
          kicker: "你们之间",
          title: `${displayName}平时如何称呼你？`,
          description: "例如“小雨”“闺女”，或只属于你们之间的称呼。",
          control: <SceneField label="TA 如何称呼我" value={preferredAddress} onChange={(value) => reviseText(setPreferredAddress, value)} />,
        };
      case 3:
        return {
          kicker: "一句熟悉的话",
          title: `${displayName}最常说哪句话？`,
          description: "写下真实说过的话。它会让第一句问候更接近你熟悉的语气。",
          control: <SceneField multiline label="TA 常说的一句话" value={catchPhrases} onChange={(value) => reviseText(setCatchPhrases, value)} />,
        };
      case 4:
        return {
          kicker: "说话的样子",
          title: `${displayName}说话时，有什么习惯？`,
          description: "比如语速、语气、常用停顿。不要写你不确定的性格或经历。",
          control: <SceneField multiline label="TA 的说话习惯" value={speechStyle} onChange={(value) => reviseText(setSpeechStyle, value)} />,
        };
      case 5:
        return {
          kicker: "共同回忆",
          title: "哪一段记忆，你想先告诉 TA？",
          description: "写下一件你确认真实发生过的事。它会留在第一句问候和今后的对话里。",
          control: <SceneField multiline label="一段共同回忆" value={sharedMemory} onChange={(value) => reviseText(setSharedMemory, value)} />,
        };
      case 6:
        return {
          kicker: "一张照片",
          title: `让${displayName}先被看见。`,
          description: "照片只用于人物出现、第一句问候和聊天头像。没有照片时，会保留文字形象。",
          control: <label className={styles.mediaChoice}><strong>{photoFile ? "重新选择照片" : "选择一张照片"}</strong><span>{photoFile?.name || "JPG、PNG 等，最大 20MB；可以稍后再上传"}</span><input className={styles.fileInput} aria-label="选择 TA 的照片" type="file" accept="image/*" onChange={(event) => chooseMedia("photo", event)} /></label>,
        };
      case 7:
        return {
          kicker: "一段声音 · 可选",
          title: "你有一段真实声音吗？",
          description: "这里只保存你有权使用的原始声音素材，不会改变或模仿它。没有声音也可以继续。",
          control: <label className={styles.mediaChoice}><strong>{voiceFile ? "重新选择声音" : "选择一段声音"}</strong><span>{voiceFile?.name || "常见音频格式，最大 20MB；不上传也可继续"}</span><input className={styles.fileInput} aria-label="选择真实声音" type="file" accept="audio/*" onChange={(event) => chooseMedia("voice", event)} /></label>,
        };
      default:
        return {
          kicker: "最后一次确认",
          title: `这些真实资料，可以交给忆见吗？`,
          description: "忆见会根据这些资料生成 AI 内容，但不会把它当作现实中的 TA 或医疗建议。",
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
        "--formation-light-opacity": 0.16 + formation * 0.54,
        "--formation-ring-alpha": 0.08 + formation * 0.13,
        "--formation-ring-scale": 0.9 + formation * 0.1,
        "--formation-offset": `${(1 - formation) * 1.8}rem`,
        "--formation-scale": 0.84 + formation * 0.16,
        "--formation-glow-opacity": 0.12 + formation * 0.34,
        "--formation-shade-alpha": (1 - formation) * 0.52,
        "--formation-photo-saturation": 0.72 + formation * 0.22,
        "--formation-photo-contrast": 0.92 + formation * 0.08,
        "--formation-photo-opacity": 0.24 + formation * 0.76,
        "--formation-photo-scale": 1.08 - formation * 0.08,
        "--formation-initials-alpha": 0.35 + formation * 0.44,
        "--formation-motes-opacity": 0.15 + formation * 0.55,
      } as React.CSSProperties}
    >
      <div className={styles.starField} aria-hidden="true" />
      <div className={styles.frame}>
        <header className={styles.header}>
          <button className={styles.wordmark} type="button" onClick={leaveFlow} aria-label="回到忆见登录页">忆见 <span>memoryai</span></button>
          {stage === "questions" && (
            <div className={styles.memoryProgress} aria-label="创建进度">
              {Array.from({ length: QUESTION_COUNT }, (_, index) => (
                <span
                  key={index}
                  className={index < questionIndex ? styles.progressDone : index === questionIndex ? styles.progressCurrent : ""}
                />
              ))}
            </div>
          )}
          {previewMode && <span className={styles.previewNotice}>开发预览 · 内容不保存</span>}
          <AiGeneratedLabel compact />
        </header>

        <main className={styles.main} aria-labelledby={titleId}>
          <section className={styles.presenceStage} aria-label="TA 正在同一记忆空间中逐渐形成">
            <div className={styles.lightColumn} aria-hidden="true" />
            <div className={styles.memoryRing} aria-hidden="true" />
            <PresencePortrait image={portraitUrl} name={displayName} formation={formation} revealed={revealed} fragments={memoryFragments} />
            <p className={styles.presenceName}>{revealed ? displayName : questionIndex < 1 ? "一个熟悉的轮廓" : displayName}</p>
          </section>

          <section className={`${styles.controlShell} ${revealed ? styles.controlAfterReveal : ""}`} aria-describedby="flow-description">

              {stage === "login-phone" && (
                <form className={styles.copyBlock} onSubmit={(event) => { event.preventDefault(); void sendCode(); }} noValidate>
                  <p className={styles.kicker}>短信登录</p>
                  <h1 id={titleId}>先确认，是你。</h1>
                  <p id="flow-description">验证成功后，你会继续留在这片记忆空间。</p>
                  <MemoryInput label="手机号" type="tel" inputMode="numeric" autoComplete="tel" value={phone} onChange={(event: ChangeEvent<HTMLInputElement>) => setPhone(event.currentTarget.value)} autoFocus error={error || undefined} />
                  <label className={styles.loginAgreement}><input type="checkbox" checked={loginAgreementAccepted} onChange={(event) => { setError(""); setLoginAgreementAccepted(event.currentTarget.checked); }} /><span>我已阅读并同意 <a href="/terms">《用户协议》</a> 与 <a href="/privacy">《隐私政策》</a>。</span></label>
                  <div className={styles.actions}><button className={styles.backButton} type="button" onClick={leaveFlow}>返回</button><MemoryButton type="submit" loading={busy} disabled={!loginAgreementAccepted}>发送验证码</MemoryButton></div>
                </form>
              )}

              {stage === "login-code" && (
                <form className={styles.copyBlock} onSubmit={(event) => { event.preventDefault(); void verifyCode(); }} noValidate>
                  <p className={styles.kicker}>验证短信</p>
                  <h1 id={titleId}>输入 6 位验证码。</h1>
                  <p id="flow-description">确认是你以后，再继续写下关于 TA 的记忆。</p>
                  <MemoryInput label="短信验证码" type="text" inputMode="numeric" autoComplete="one-time-code" value={code} onChange={(event: ChangeEvent<HTMLInputElement>) => setCode(event.currentTarget.value)} autoFocus error={error || undefined} />
                  <div className={styles.actions}><button className={styles.backButton} type="button" onClick={() => setStage("login-phone")}>更换号码</button><MemoryButton type="submit" loading={busy} disabled={!loginAgreementAccepted}>验证并继续</MemoryButton></div>
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
                <form className={styles.copyBlock} key={questionIndex} onSubmit={submitQuestion} noValidate>
                  <p className={styles.kicker}>{question.kicker}</p>
                  <h1 id={titleId}>{question.title}</h1>
                  <p id="flow-description">{question.description}</p>
                  <div className={styles.singleQuestion} key={questionIndex}>{question.control}</div>
                  {error && <p className={styles.error} role="alert">{error}</p>}
                  {authState === "checking" && !previewMode && <p className={styles.inlineStatus} role="status">正在确认登录状态，你写下的内容仍会留在这里。</p>}
                  <div className={styles.actions}>
                    <button className={styles.backButton} type="button" onClick={goBack}>返回</button>
                    <MemoryButton type="submit">{questionIndex === QUESTION_COUNT - 1 ? "确认资料并创建 TA" : "继续"}</MemoryButton>
                  </div>
                </form>
              )}

              {stage === "creating" && (
                <div className={styles.copyBlock} role="status" aria-live="polite">
                  <p className={styles.kicker}>记忆正在靠近</p>
                  <h1 id={titleId}>正在收好你刚刚写下的一切。</h1>
                  <p id="flow-description">资料和素材保存好以后，人物才会真正出现。</p>
                  <div className={styles.waitingPulse} aria-hidden="true"><i /><i /><i /></div>
                </div>
              )}

              {stage === "network-failed" && (
                <div className={styles.copyBlock} role="alert">
                  <p className={styles.kicker}>连接暂时中断</p>
                  <h1 id={titleId}>刚才那一步没有被重复。</h1>
                  <p id="flow-description">{error}</p>
                  <div className={styles.actions}>
                    <MemoryButton loading={busy} onClick={() => void continueRecoveredCreation()}>确认刚才的创建</MemoryButton>
                    <button className={styles.backButton} type="button" onClick={() => { setError(""); setQuestionIndex(8); setStage("questions"); }}>返回检查回答</button>
                  </div>
                </div>
              )}

              {stage === "auth-required" && (
                <div className={styles.copyBlock} role="alert">
                  <p className={styles.kicker}>登录保护</p>
                  <h1 id={titleId}>需要重新确认登录。</h1>
                  <p id="flow-description">这次还没有继续保存任何资料；已经写下的内容仍留在当前页面。</p>
                  <div className={styles.actions}><MemoryButton onClick={leaveFlow}>回到登录页</MemoryButton></div>
                </div>
              )}

              {stage === "preview-forming" && (
                <div className={styles.copyBlock} role="status" aria-live="polite">
                  <p className={styles.kicker}>记忆正在靠近</p>
                  <h1 id={titleId}>你确认的资料，正在汇到一个画面。</h1>
                  <p id="flow-description">再等一会儿，让这些熟悉的片段慢慢聚在一起。</p>
                  <div className={styles.waitingPulse} aria-hidden="true"><i /><i /><i /></div>
                </div>
              )}

              {stage === "preview-reveal" && (
                <div className={`${styles.copyBlock} ${styles.revealCopy}`}>
                  <p className={styles.kicker}>人物出现</p>
                  <h1 id={titleId}>{displayName}，先被你看见。</h1>
                  <p id="flow-description">{portraitUrl ? "你选择的照片，已经从轮廓里慢慢显现。" : "没有照片时，这里会安静地保留文字形象。"}</p>
                  <div className={styles.revealActions}><MemoryButton onClick={() => setStage("preview-greeting")}>听听 TA 的第一句话</MemoryButton></div>
                </div>
              )}

              {stage === "preview-greeting" && (
                <div className={styles.copyBlock}>
                  <p className={styles.kicker}>第一句问候</p>
                  <h1 id={titleId}>{previewGreeting}</h1>
                  <p id="flow-description">这句问候来自你刚刚写下的称呼、习惯和共同回忆。</p>
                  <div className={styles.previewGreetingAvatar}><MemoryAvatar image={portraitUrl} initials={displayName} alt={`${displayName} 的照片`} presence="online" size={46} /><span>{speechStyle}</span></div>
                  <div className={styles.actions}><MemoryButton onClick={() => setStage("preview-chat-one")}>继续说说话</MemoryButton></div>
                </div>
              )}

              {stage === "preview-chat-one" && (
                <div className={styles.copyBlock}>
                  <p className={styles.kicker}>再说一会儿</p>
                  <h1 id={titleId}>慢慢说，我在听。</h1>
                  <PreviewConversation name={displayName} portraitUrl={portraitUrl} catchPhrase={catchPhrases} speechStyle={speechStyle} sharedMemory={sharedMemory} rounds={1} />
                  <div className={styles.actions}><MemoryButton onClick={leaveFlow}>再说一句</MemoryButton></div>
                </div>
              )}

          </section>
        </main>

        <footer className={styles.footer}><span>你随时可以返回。</span><span>刚写下的内容会留在这里。</span></footer>
      </div>
    </MemorySurface>
  );
}
