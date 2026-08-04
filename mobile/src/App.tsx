import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { App as NativeApp } from "@capacitor/app";
import { Haptics, ImpactStyle } from "@capacitor/haptics";
import { Preferences } from "@capacitor/preferences";
import { runtimeConfig } from "./config/environment";
import { MemoryMedia, type PickedMedia } from "./native/memory-media";
import {
  productApi,
  ProductApiError,
  type ProductConversation,
  type ProductAccountDeletionProgress,
  type ProductCrisisContact,
  type FirstPresenceVideoSafeDto,
  type ProductMemory,
  type ProductMemoryProfileInput,
  type ProductPickup,
  type ProductPickupPhotoSource,
  type ProductVideoShare,
} from "./product/api";
import {
  REPLY_CORRECTION_REASONS,
  createReplyCorrectionSuggestion,
  type ReplyCorrectionReason,
  type ReplyCorrectionSuggestion,
} from "../../src/components/first-presence/memoryReplyCorrection";
import {
  CreationFlowError,
  type PendingCreation,
  requestServerGreeting,
  startPendingCreation,
  uploadPendingMedia,
} from "./product/creation-flow";
import { classifyOwnedMemories, findIncompleteMemory, isIncompleteMemory, resumePendingCreation } from "./product/incomplete-memory";
import { VideoOpportunityScreen } from "./product/VideoOpportunityScreen";
import { mayConfirmPickup, pickupDraft } from "./product/pickup";
import { MOBILE_PRIMARY_COMPANION_KEY, selectPrimaryCompanion } from "./product/primary-companion";

const DebugLab = __MOBILE_DEBUG_BUILD__
  ? lazy(() => import("./debug/NativeCapabilityLab").then((module) => ({ default: module.NativeCapabilityLab })))
  : null;

type Screen = "splash" | "welcome" | "login" | "code" | "home" | "create" | "complete" | "presence" | "chat" | "memory" | "video" | "profile" | "dataExport" | "videoShares" | "offline" | "unavailable" | "debug";
type SessionMode = "remote" | "preview";

const previewMemory = (name: string, relationship: string, lifeStory: string): ProductMemory => ({
  id: "preview-memory",
  name: name.trim() || "TA",
  relationship: relationship.trim() || "重要的人",
  lifeStory: lifeStory.trim() || "那些一起走过的日子，仍然在心里发着光。",
});

function friendlyError(error: unknown): string {
  if (error instanceof CreationFlowError) return error.message;
  if (error instanceof ProductApiError) {
    if (error.status === 401) return "登录状态已过期，请重新登录。";
    if (error.status === 403) return "当前服务暂时无法完成这一步。";
    if (error.status === 429 && error.message === "FREE_CHAT_DAILY_LIMIT_REACHED") return "今天的免费对话已用完；你可以明天再来。安全陪伴始终可用。";
    if (error.status === 503) return "服务正在休息，请稍后再试。";
    return error.message.includes("网络") ? error.message : "暂时无法完成这一步，请稍后再试。";
  }
  return "暂时无法完成这一步，请稍后再试。";
}

function initials(name: string) {
  return Array.from(name.trim() || "忆见").slice(0, 2).join("");
}

function firstMemoryId(memories: ProductMemory[]): string | null {
  if (memories.length === 1) return memories[0]?.id ?? null;
  if (!memories.length || memories.some((memory) => !memory.createdAt?.trim())) return null;
  return [...memories].sort((left, right) => left.createdAt!.localeCompare(right.createdAt!))[0]?.id ?? null;
}

function pickupRequestKey(): string {
  return `mobile-pickup-${crypto.randomUUID()}`;
}

function confirmedPickupSourceIds(metadata: Record<string, unknown> | null | undefined): string[] {
  const rawSources = metadata?.confirmedPickupSources;
  if (!Array.isArray(rawSources)) return [];
  const ids: string[] = [];
  const seen = new Set<string>();
  for (const raw of rawSources) {
    if (typeof raw !== "object" || raw === null) continue;
    const source = raw as Record<string, unknown>;
    if (typeof source.id !== "string" || source.sourceKind !== "user_confirmed_pickup") continue;
    if (!seen.has(source.id)) {
      seen.add(source.id);
      ids.push(source.id);
    }
  }
  return ids;
}

function profileDraft(memory: ProductMemory): ProductMemoryProfileInput {
  return {
    name: memory.name,
    relationship: memory.relationship,
    lifeStory: memory.lifeStory ?? null,
    personalityProfile: memory.personalityProfile ?? null,
    speechStyle: memory.speechStyle ?? null,
    catchPhrases: memory.catchPhrases ?? null,
  };
}

function press(action: () => void) {
  void Haptics.impact({ style: ImpactStyle.Light }).catch(() => undefined);
  action();
}

function BrandSplash() {
  return <main className="brandSplash" aria-label="忆见">
    <div className="brandHalo" aria-hidden="true" />
    <div className="brandMark"><span>忆见</span><small>MEMORYAI</small></div>
    <p>让已确认的纪念资料，留在日常里。</p>
  </main>;
}

function Offline({ retry }: { retry: () => void }) {
  return <main className="offlineScene">
    <div className="quietDot" aria-hidden="true" />
    <p className="eyebrow">忆见</p>
    <h1>此刻没有网络。</h1>
    <p>恢复连接后，你可以重新读取服务端已保存的资料。未送出的内容不会自动发送。</p>
    <button className="textButton" onClick={retry}>重新连接</button>
  </main>;
}

function ServiceUnavailable({ retry }: { retry: () => void }) {
  return <main className="offlineScene">
    <div className="quietDot" aria-hidden="true" />
    <p className="eyebrow">忆见</p>
    <h1>暂时无法读取服务状态。</h1>
    <p>登录状态和已保存资料尚未确认。不会切换为预览，也不会自动发送、创建或修改任何内容。</p>
    <button className="textButton" onClick={retry}>重新读取</button>
  </main>;
}

function BottomNav({ active, onChange, hasMemory }: { active: Screen; onChange: (screen: Screen) => void; hasMemory: boolean }) {
  if (active === "chat" || active === "memory") return null;
  const launchLabels: Partial<Record<Screen, string>> = { home: "相伴", memory: "拾忆", profile: "我的" };
  const items: Array<[Screen, string, string]> = [
    ["home", "⌂", "首页"],
    ["chat", "·", "聊天"],
    ["memory", "◌", "记忆"],
    ["profile", "○", "我的"],
  ];
  return <nav className="bottomNav" aria-label="主导航">
    {items.filter(([screen]) => screen in launchLabels).map(([screen, icon]) => <button key={screen} className={active === screen ? "active" : ""} onClick={() => press(() => onChange(screen))}>
      <span>{icon}</span><small>{launchLabels[screen]!}</small>{screen !== "profile" && screen !== "home" && !hasMemory ? <i /> : null}
    </button>)}
  </nav>;
}

export function App() {
  const [screen, setScreen] = useState<Screen>("splash");
  const [online, setOnline] = useState(() => navigator.onLine);
  const [reconnectAttempt, setReconnectAttempt] = useState(0);
  const [mode, setMode] = useState<SessionMode>("remote");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [challengeId, setChallengeId] = useState("");
  const [memory, setMemory] = useState<ProductMemory | null>(null);
  const [ownedMemories, setOwnedMemories] = useState<ProductMemory[]>([]);
  const [primarySelectorOpen, setPrimarySelectorOpen] = useState(false);
  const [incompleteMemory, setIncompleteMemory] = useState<ProductMemory | null>(null);
  const [resumingMemory, setResumingMemory] = useState<ProductMemory | null>(null);
  const [firstOwnedMemoryId, setFirstOwnedMemoryId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [relationship, setRelationship] = useState("");
  const [story, setStory] = useState("");
  const [media, setMedia] = useState<PickedMedia[]>([]);
  const [pendingCreation, setPendingCreation] = useState<PendingCreation | null>(null);
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [conversation, setConversation] = useState<ProductConversation>({ sessionId: null, messages: [] });
  const [question, setQuestion] = useState("");
  const [questionIdempotencyKey, setQuestionIdempotencyKey] = useState<string | null>(null);
  const [replyCorrectionContent, setReplyCorrectionContent] = useState<string | null>(null);
  const [replyCorrectionReason, setReplyCorrectionReason] = useState<ReplyCorrectionReason>("称呼不对");
  const [replyCorrectionDetail, setReplyCorrectionDetail] = useState("");
  const [replyCorrectionSuggestion, setReplyCorrectionSuggestion] = useState<ReplyCorrectionSuggestion | null>(null);
  const [replyCorrectionError, setReplyCorrectionError] = useState("");
  const [pickups, setPickups] = useState<ProductPickup[]>([]);
  const [pickupPhotoSources, setPickupPhotoSources] = useState<ProductPickupPhotoSource[]>([]);
  const [selectedPickupPhotoAssetId, setSelectedPickupPhotoAssetId] = useState<string | null>(null);
  const [highlightedPickupIds, setHighlightedPickupIds] = useState<string[]>([]);
  const [pickupOriginalText, setPickupOriginalText] = useState("");
  const [pickupOrganizedText, setPickupOrganizedText] = useState("");
  const [pickupConfirmed, setPickupConfirmed] = useState(false);
  const [pickupFollowUpAsked, setPickupFollowUpAsked] = useState(false);
  const [editingPickupId, setEditingPickupId] = useState<string | null>(null);
  const [pickupRequestIdempotencyKey, setPickupRequestIdempotencyKey] = useState<string | null>(null);
  const [birthDate, setBirthDate] = useState("");
  const [taProfileDraft, setTaProfileDraft] = useState<ProductMemoryProfileInput | null>(null);
  const [taProfileEditing, setTaProfileEditing] = useState(false);
  const [crisisSupportEnabled, setCrisisSupportEnabled] = useState(false);
  const [crisisContacts, setCrisisContacts] = useState<ProductCrisisContact[]>([]);
  const [crisisContactExternalId, setCrisisContactExternalId] = useState("");
  const [crisisState, setCrisisState] = useState<"idle" | "loading" | "ready" | "unavailable">("idle");
  const [profileState, setProfileState] = useState<"idle" | "loading" | "ready" | "unavailable">("loading");
  const [profileReadAttempt, setProfileReadAttempt] = useState(0);
  const [deletionProgress, setDeletionProgress] = useState<ProductAccountDeletionProgress | null>(null);
  const [deletionState, setDeletionState] = useState<"idle" | "loading" | "ready" | "unavailable">("idle");
  const [deletionReadAttempt, setDeletionReadAttempt] = useState(0);
  const [deletionConfirming, setDeletionConfirming] = useState(false);
  const [resumeDeletionAfterLogin, setResumeDeletionAfterLogin] = useState(false);
  const [resumeExportAfterLogin, setResumeExportAfterLogin] = useState(false);
  const [videoShares, setVideoShares] = useState<ProductVideoShare[]>([]);
  const [shareJobs, setShareJobs] = useState<FirstPresenceVideoSafeDto[]>([]);
  const [shareTitle, setShareTitle] = useState("");
  const [shareState, setShareState] = useState<"idle" | "loading" | "ready" | "unavailable">("idle");

  const hasMemory = Boolean(memory);
  const hasIncompleteMemory = Boolean(incompleteMemory);
  const title = memory?.name || "TA";
  const isFirstMemory = Boolean(memory && firstOwnedMemoryId === memory.id);
  const messages = conversation.messages;
  const productOnline = online && (mode === "preview" || productApi.enabled());

  const loadOwnedMemories = useCallback(async () => {
    const memories = await productApi.listMemories();
    const preference = await Preferences.get({ key: MOBILE_PRIMARY_COMPANION_KEY }).catch(() => ({ value: null }));
    const { incomplete } = classifyOwnedMemories(memories);
    const restoredMemory = selectPrimaryCompanion(memories, preference.value);
    const restoredConversation = restoredMemory && !isIncompleteMemory(restoredMemory)
      ? await productApi.getConversation(restoredMemory.id)
      : { sessionId: null, messages: [] };
    return { memories, incomplete, restoredMemory, restoredConversation };
  }, []);

  const applyOwnedMemories = useCallback((restored: Awaited<ReturnType<typeof loadOwnedMemories>>) => {
    setMode("remote");
    setMemory(restored.restoredMemory);
    setOwnedMemories(restored.memories);
    setIncompleteMemory(restored.incomplete);
    setResumingMemory(null);
    setFirstOwnedMemoryId(firstMemoryId(restored.memories));
    setConversation(restored.restoredConversation);
    setScreen("home");
  }, [loadOwnedMemories]);

  useEffect(() => {
    let active = true;
    const restoreSession = async () => {
      if (!navigator.onLine) {
        if (active) setScreen("offline");
        return;
      }
      if (!productApi.enabled()) {
        if (active) setScreen("welcome");
        return;
      }
      try {
        const session = await productApi.session();
        if (!session.authenticated) {
          if (active) setScreen("welcome");
          return;
        }
        const restored = await loadOwnedMemories();
        if (!active) return;
        applyOwnedMemories(restored);
      } catch {
        if (active) setScreen("unavailable");
      }
    };
    const finish = window.setTimeout(() => { void restoreSession(); }, 1000);
    const onOnline = () => { setOnline(true); void restoreSession(); };
    const onOffline = () => { setOnline(false); setScreen("offline"); };
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => { active = false; window.clearTimeout(finish); window.removeEventListener("online", onOnline); window.removeEventListener("offline", onOffline); };
  }, [applyOwnedMemories, loadOwnedMemories, reconnectAttempt]);

  useEffect(() => {
    if (screen !== "memory" || !memory || mode === "preview") {
      setPickups([]);
      setPickupPhotoSources([]);
      setSelectedPickupPhotoAssetId(null);
      return;
    }
    let live = true;
    void Promise.all([productApi.listPickups(memory.id), productApi.listPickupPhotoSources(memory.id)]).then(([nextPickups, nextPhotoSources]) => {
      if (!live) return;
      setPickups(nextPickups);
      setPickupPhotoSources(nextPhotoSources);
    }).catch((error) => {
      if (live) setNotice(friendlyError(error));
    });
    return () => { live = false; };
  }, [memory, mode, screen]);

  useEffect(() => {
    if (screen !== "profile" || mode === "preview") return;
    let live = true;
    setProfileState("loading");
    void productApi.getAccountProfile().then((profile) => {
      if (!live) return;
      setBirthDate(profile.birthDate ?? "");
      setProfileState("ready");
    }).catch(() => {
      if (live) setProfileState("unavailable");
    });
    return () => { live = false; };
  }, [mode, profileReadAttempt, screen]);

  const refreshCrisisSupport = useCallback(async () => {
    if (mode === "preview") return;
    setCrisisState("loading");
    try {
      const value = await productApi.getCrisisSupport();
      setCrisisSupportEnabled(value.enabled); setCrisisContacts(value.contacts); setCrisisState("ready");
    } catch { setCrisisState("unavailable"); }
  }, [mode]);

  useEffect(() => {
    if (screen === "profile" && mode !== "preview") void refreshCrisisSupport();
  }, [mode, refreshCrisisSupport, screen]);

  useEffect(() => {
    if (screen !== "profile" || mode === "preview") return;
    let live = true;
    setDeletionState("loading");
    void productApi.getAccountDeletion().then((progress) => {
      if (!live) return;
      setDeletionProgress(progress);
      setDeletionState("ready");
    }).catch(() => {
      if (live) setDeletionState("unavailable");
    });
    return () => { live = false; };
  }, [deletionReadAttempt, mode, screen]);

  const openMemory = useCallback(async (id: string, destination: "home" | "memory" | "video" = "memory", rememberPrimary = false) => {
    if (__MOBILE_DEBUG_BUILD__ && id === "preview-memory") {
      setMode("preview");
      setConversation({ sessionId: null, messages: [] });
      setFirstOwnedMemoryId(null);
      setMemory((current) => current ?? previewMemory("TA", "重要的人", "那些共同经历的瞬间，仍然被好好记得。"));
      setScreen(destination);
      return;
    }
    if (!online || !productApi.enabled()) { setScreen("offline"); return; }
    setBusy(true);
    try {
      const [ownedMemory, memories] = await Promise.all([
        productApi.getMemory(id),
        productApi.listMemories(),
      ]);
      const incomplete = findIncompleteMemory(memories);
      const restoredConversation = isIncompleteMemory(ownedMemory)
        ? { sessionId: null, messages: [] }
        : await productApi.getConversation(id);
      if (rememberPrimary) {
        await Preferences.set({ key: MOBILE_PRIMARY_COMPANION_KEY, value: ownedMemory.id }).catch(() => {
          throw new ProductApiError(503, "无法保存主 TA 选择，请稍后再试");
        });
      }
      setMemory(ownedMemory);
      setOwnedMemories(memories);
      setIncompleteMemory(incomplete);
      setResumingMemory(null);
      setConversation(restoredConversation);
      setFirstOwnedMemoryId(firstMemoryId(memories));
      setMode("remote");
      setPrimarySelectorOpen(false);
      setScreen(destination);
    }
    catch (error) { setNotice(friendlyError(error)); setScreen("home"); }
    finally { setBusy(false); }
  }, [online]);

  const handleAppUrl = useCallback((url: string) => {
      try {
        const directMemoryId = /^yijianmemory:\/\/memory\/([^/?#]+)/.exec(url)?.[1] ?? "";
        const destination = /[?&]view=(?:gallery|video)(?:[&#]|$)/.test(url) ? "video" : "memory";
        if (directMemoryId) { void openMemory(directMemoryId, destination); return; }
        const parsed = new URL(url);
        if (parsed.hostname === "memory" && parsed.pathname.length > 1) { void openMemory(parsed.pathname.replace(/^\//, ""), destination); return; }
        if (__MOBILE_DEBUG_BUILD__ && parsed.hostname === "debug" && parsed.pathname === "/native") setScreen("debug");
      } catch { setScreen("home"); }
  }, [openMemory]);

  useEffect(() => {
    const listener = NativeApp.addListener("appUrlOpen", ({ url }) => {
      handleAppUrl(url);
    });
    void NativeApp.getLaunchUrl().then((result) => {
      if (result?.url) handleAppUrl(result.url);
    });
    return () => { void listener.then((value) => value.remove()); };
  }, [handleAppUrl]);

  const beginPreview = () => {
    setMode("preview");
    setNotice("");
    setScreen("home");
  };

  const sendCode = async () => {
    if (!/^1\d{10}$/.test(phone.trim())) { setNotice("请输入正确的中国大陆手机号。"); return; }
    if (!productApi.enabled()) { setNotice("当前服务尚未连接，请稍后再试。"); return; }
    setBusy(true); setNotice("");
    try {
      const result = await productApi.sendCode(phone.trim());
      if (!result.challengeId) throw new ProductApiError(503);
      setChallengeId(result.challengeId); setScreen("code");
    } catch (error) { setNotice(friendlyError(error)); }
    finally { setBusy(false); }
  };

  const verifyCode = async () => {
    if (!/^\d{6}$/.test(code.trim()) || !challengeId) { setNotice("请输入 6 位验证码。"); return; }
    setBusy(true); setNotice("");
    try {
      const result = await productApi.verifyCode(phone.trim(), challengeId, code.trim());
      if (!result.authenticated) throw new ProductApiError(401);
      applyOwnedMemories(await loadOwnedMemories());
      if (resumeDeletionAfterLogin) {
        setResumeDeletionAfterLogin(false);
        setScreen("profile");
        setNotice("短信登录已完成。请在 5 分钟内返回注销确认；系统不会自动提交。");
      } else if (resumeExportAfterLogin) {
        setResumeExportAfterLogin(false);
        setScreen("dataExport");
        setNotice("短信登录已完成。请在 5 分钟内手动下载资料副本；系统不会自动导出。");
      }
    } catch (error) { setNotice(friendlyError(error)); }
    finally { setBusy(false); }
  };

  const continueIncompleteMemory = () => {
    const target = incompleteMemory;
    if (!target) return;
    setMemory(target);
    setResumingMemory(target);
    setPendingCreation(null);
    setName(target.name);
    setRelationship(target.relationship);
    setStory(target.lifeStory ?? "");
    setMedia([]);
    setConversation({ sessionId: null, messages: [] });
    setNotice("请重新选择一张照片后继续保存。");
    setScreen("complete");
  };

  const beginCreateMemory = () => {
    if (mode !== "preview" && incompleteMemory) {
      continueIncompleteMemory();
      return;
    }
    setResumingMemory(null);
    setPendingCreation(null);
    setMedia([]);
    setNotice("");
    setScreen("create");
  };

  const chooseMedia = async () => {
    try {
      const result = await MemoryMedia.pickMedia({ limit: 20 });
      setMedia(result.items);
      if (pendingCreation && pendingCreation.uploadedMediaUris.length === 0) {
        setPendingCreation({ ...pendingCreation, media: result.items });
      }
      setNotice(result.items.length ? `已选 ${result.items.length} 项素材。` : "");
    } catch { setNotice("这次没有选择素材。"); }
  };

  const createMemory = async () => {
    if (!resumingMemory && (!name.trim() || !relationship.trim())) { setNotice("请先写下 TA 的名字和你们的关系。"); return; }
    if (mode !== "preview" && !pendingCreation && !media.some((item) => item.mimeType.toLowerCase().startsWith("image/"))) {
      setNotice("请至少选择一张照片后再继续。");
      return;
    }
    setBusy(true); setNotice("");
    try {
      if (mode === "preview") {
        const created = previewMemory(name, relationship, story);
        setMemory(created);
        setFirstOwnedMemoryId(null);
        setConversation({ sessionId: null, messages: [{ role: "assistant", content: `AI生成 · 基于已确认资料：关于 ${created.name}，你想先从哪一段记忆开始？` }] });
        setScreen("presence");
        return;
      }
      let pending = pendingCreation;
      if (!pending) {
        const created = resumingMemory
          ?? await productApi.createMemory({ name: name.trim(), relationship: relationship.trim(), lifeStory: story.trim() });
        pending = resumingMemory
          ? resumePendingCreation(created, media)
          : startPendingCreation(created, media);
        setPendingCreation(pending);
      }
      const uploaded = await uploadPendingMedia(pending, productApi, setPendingCreation);
      setPendingCreation(uploaded);
      const confirmedMemory = await productApi.getMemory(uploaded.memory.id);
      if (!confirmedMemory.photoAssetId?.trim()) {
        throw new ProductApiError(502, "The uploaded portrait was not confirmed by the server.");
      }
      await requestServerGreeting(uploaded, productApi);
      const [restoredConversation, memories] = await Promise.all([
        productApi.getConversation(confirmedMemory.id),
        productApi.listMemories(),
      ]);
      setMemory(confirmedMemory);
      setOwnedMemories(memories);
      setConversation(restoredConversation);
      setFirstOwnedMemoryId(firstMemoryId(memories));
      setIncompleteMemory(findIncompleteMemory(memories));
      setResumingMemory(null);
      setPendingCreation(null);
      setScreen("presence");
    } catch (error) { setNotice(friendlyError(error)); }
    finally { setBusy(false); }
  };

  const sendQuestion = async () => {
    const value = question.trim();
    if (!value || !memory) return;
    const idempotencyKey = questionIdempotencyKey ?? `mobile-chat-${crypto.randomUUID()}`;
    setQuestionIdempotencyKey(idempotencyKey);
    setBusy(true);
    try {
      if (mode === "preview") {
        setConversation((current) => ({
          ...current,
          sessionId: null,
          messages: [...current.messages, { role: "assistant", content: "AI生成 · 基于当前对话：你可以慢慢说；如有需要，也可以联系身边可信任的人。" }],
        }));
      } else {
        const result = await productApi.askMemory(memory.id, value, idempotencyKey);
        setConversation(await productApi.getConversation(memory.id));
        if (result.freeChatWarning === true) setNotice("今天的免费对话即将用完；如需继续，明天可以再来。安全陪伴始终可用。");
      }
      setQuestion("");
      setQuestionIdempotencyKey(null);
    } catch (error) { setQuestion(value); setNotice(`${friendlyError(error)} Your message was not confirmed as sent.`); }
    finally { setBusy(false); }
  };

  const resetPickupDraft = () => {
    setPickupOriginalText("");
    setPickupOrganizedText("");
    setPickupConfirmed(false);
    setPickupFollowUpAsked(false);
    setSelectedPickupPhotoAssetId(null);
    setEditingPickupId(null);
    setPickupRequestIdempotencyKey(null);
  };

  const savePickup = async () => {
    if (!memory || !mayConfirmPickup(pickupOriginalText, pickupOrganizedText, pickupConfirmed) || busy) return;
    setBusy(true); setNotice("");
    try {
      const input = { originalText: pickupOriginalText.trim(), organizedText: pickupOrganizedText.trim(), ...(!editingPickupId && selectedPickupPhotoAssetId ? { photoAssetId: selectedPickupPhotoAssetId } : {}) };
      const idempotencyKey = pickupRequestIdempotencyKey ?? pickupRequestKey();
      setPickupRequestIdempotencyKey(idempotencyKey);
      const pickup = editingPickupId
        ? await productApi.updatePickup(memory.id, editingPickupId, input)
        : await productApi.confirmPickup(memory.id, input, idempotencyKey);
      setPickups((current) => editingPickupId
        ? current.map((entry) => entry.id === pickup.id ? pickup : entry)
        : [pickup, ...current.filter((entry) => entry.id !== pickup.id)]);
      resetPickupDraft();
      setNotice(editingPickupId ? "已更新确认资料。" : "已经替你收好了。这条资料现在可作为可追溯来源使用。");
    } catch (error) { setNotice(friendlyError(error)); }
    finally { setBusy(false); }
  };

  const editPickup = (pickup: ProductPickup) => {
    setEditingPickupId(pickup.id);
    setPickupOriginalText(pickup.originalText);
    setPickupOrganizedText(pickup.organizedText);
    setPickupConfirmed(true);
    setPickupFollowUpAsked(false);
    setSelectedPickupPhotoAssetId(null);
    setPickupRequestIdempotencyKey(null);
  };

  const removePickup = async (pickup: ProductPickup) => {
    if (!memory || busy || !window.confirm("删除后，这条资料将不再作为 TA 可引用来源。确定删除吗？")) return;
    setBusy(true); setNotice("");
    try {
      await productApi.deletePickup(memory.id, pickup.id);
      setPickups((current) => current.filter((entry) => entry.id !== pickup.id));
      if (editingPickupId === pickup.id) resetPickupDraft();
      setNotice("已删除，这条资料不会再被引用。");
    } catch (error) { setNotice(friendlyError(error)); }
    finally { setBusy(false); }
  };

  const saveBirthDate = async () => {
    if (busy || !/^\d{4}-\d{2}-\d{2}$/.test(birthDate)) {
      if (birthDate) setNotice("请使用 YYYY-MM-DD 格式填写生日。");
      return;
    }
    setBusy(true); setNotice("");
    try {
      const profile = await productApi.updateBirthDate(birthDate);
      setBirthDate(profile.birthDate);
      setProfileState("ready");
      setNotice("生日已保存；你可以随时修改。");
    } catch (error) { setNotice(friendlyError(error)); }
    finally { setBusy(false); }
  };

  const beginTaProfileEdit = () => {
    if (!memory || busy) return;
    setTaProfileDraft(profileDraft(memory));
    setTaProfileEditing(true);
    setNotice("");
  };

  const updateTaProfileDraft = (field: keyof ProductMemoryProfileInput, value: string) => {
    setTaProfileDraft((current) => current ? { ...current, [field]: value || null } : current);
  };

  const saveTaProfile = async () => {
    if (!memory || !taProfileDraft || busy || !taProfileDraft.name.trim() || !taProfileDraft.relationship.trim()) return;
    setBusy(true); setNotice("");
    try {
      const updated = await productApi.updateMemoryProfile(memory.id, {
        ...taProfileDraft,
        name: taProfileDraft.name.trim(),
        relationship: taProfileDraft.relationship.trim(),
      });
      setMemory(updated);
      setOwnedMemories((current) => current.map((candidate) => candidate.id === updated.id ? updated : candidate));
      setTaProfileDraft(profileDraft(updated));
      setTaProfileEditing(false);
      setNotice("TA 资料已由服务端确认保存；这不会改写已经发生的对话。");
    } catch (error) { setNotice(friendlyError(error)); }
    finally { setBusy(false); }
  };

  const openReplyCorrection = (content: string) => {
    setReplyCorrectionContent(content);
    setReplyCorrectionReason("称呼不对");
    setReplyCorrectionDetail("");
    setReplyCorrectionSuggestion(null);
    setReplyCorrectionError("");
  };

  const prepareReplyCorrection = () => {
    if (!replyCorrectionContent) return;
    const suggestion = createReplyCorrectionSuggestion(replyCorrectionReason, replyCorrectionDetail, replyCorrectionContent);
    if (!suggestion) {
      setReplyCorrectionError("请先写下你确认的正确说法或资料；忆见不会替你猜测。");
      return;
    }
    setReplyCorrectionError("");
    setReplyCorrectionSuggestion(suggestion);
  };

  const confirmReplyCorrection = async () => {
    if (busy || !memory || !replyCorrectionSuggestion) return;
    setBusy(true); setReplyCorrectionError("");
    try {
      const updated = await productApi.appendConfirmedReplyCorrection(memory.id, replyCorrectionSuggestion);
      setMemory(updated);
      setReplyCorrectionContent(null);
      setReplyCorrectionSuggestion(null);
      setNotice("你的校正已写入 TA 的已确认资料；历史对话没有被改写。");
    } catch {
      setReplyCorrectionError("校正尚未写入。请稍后重试；在确认保存前，TA 的资料不会改变。");
    } finally { setBusy(false); }
  };

  const submitAccountDeletion = async () => {
    if (busy || mode === "preview" || !deletionConfirming) return;
    setBusy(true); setNotice("");
    try {
      const progress = await productApi.requestAccountDeletion();
      setDeletionProgress(progress);
      setDeletionState("ready");
      setDeletionConfirming(false);
      setNotice("注销申请已受理。当前登录状态已由服务端撤销；请保留此页查看进度。");
    } catch (error) {
      if (error instanceof ProductApiError && error.status === 403) {
        setDeletionConfirming(false);
        setResumeDeletionAfterLogin(true);
        setNotice("为保护账户，请重新完成短信登录后，在 5 分钟内返回此页确认。系统不会自动提交。");
        setScreen("login");
      } else {
        setNotice(friendlyError(error));
      }
    } finally { setBusy(false); }
  };

  const downloadAccountDataExport = async () => {
    if (busy || mode === "preview") return;
    setBusy(true); setNotice("");
    try {
      const blob = await productApi.downloadAccountDataExport();
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = objectUrl;
      link.download = "memoryai-account-data-export.json";
      document.body.append(link);
      link.click();
      link.remove();
      globalThis.setTimeout(() => URL.revokeObjectURL(objectUrl), 0);
      setNotice("资料副本已生成，已请求系统下载；请在设备下载列表中核对结果。");
    } catch (error) {
      if (error instanceof ProductApiError && error.status === 403) {
        setResumeExportAfterLogin(true);
        setNotice("为保护你的资料，请重新完成短信登录后，在 5 分钟内手动下载资料副本。系统不会自动导出。");
        setScreen("login");
      } else {
        setNotice(friendlyError(error));
      }
    } finally { setBusy(false); }
  };

  const loadVideoShares = async () => {
    if (!memory || mode === "preview") return;
    setShareState("loading"); setNotice("");
    try {
      const [jobs, shares] = await Promise.all([productApi.listFirstPresenceVideos(memory.id), productApi.listVideoShares(memory.id)]);
      setShareJobs(jobs); setVideoShares(shares); setShareState("ready");
    } catch (error) { setShareState("unavailable"); setNotice(friendlyError(error)); }
  };

  const createVideoShare = async (jobId: string) => {
    if (!memory || busy || !shareTitle.trim()) return;
    setBusy(true); setNotice("");
    try {
      await productApi.createVideoShare(memory.id, jobId, shareTitle.trim());
      setShareTitle(""); await loadVideoShares();
    } catch (error) { setNotice(friendlyError(error)); }
    finally { setBusy(false); }
  };

  const revokeVideoShare = async (publicId: string) => {
    if (!memory || busy || !window.confirm("撤销后，公开链接将立即不可查看。确定撤销吗？")) return;
    setBusy(true); setNotice("");
    try { await productApi.revokeVideoShare(memory.id, publicId); await loadVideoShares(); }
    catch (error) { setNotice(friendlyError(error)); }
    finally { setBusy(false); }
  };

  const setVideoShareWatermarkDownload = async (publicId: string, enabled: boolean) => {
    if (!memory || busy) return;
    setBusy(true); setNotice("");
    try { await productApi.setVideoShareWatermarkDownload(memory.id, publicId, enabled); await loadVideoShares(); }
    catch (error) { setNotice(friendlyError(error)); }
    finally { setBusy(false); }
  };

  const downloadWatermarkedVideoShare = async (publicId: string) => {
    if (!memory || busy) return;
    setBusy(true); setNotice("");
    try {
      const blob = await productApi.downloadWatermarkedVideoShare(memory.id, publicId);
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = objectUrl; link.download = "memoryai-watermarked-video.mp4"; link.click();
      URL.revokeObjectURL(objectUrl);
      setNotice("已向设备交付带 AI 生成与忆见标识的影像副本；设备保存状态由系统确认。");
    } catch (error) { setNotice(friendlyError(error)); }
    finally { setBusy(false); }
  };

  const content = useMemo(() => {
    if (screen === "videoShares") {
      const approved = shareJobs.filter((job) => job.status === "succeeded" && job.saveAllowed && job.artifactAvailable && !job.manualReviewRequired);
      return <main className="profileScene">
        <header className="pageHeader"><button className="backButton" onClick={() => setScreen("profile")}>‹</button><span>影像分享</span></header>
        <h1>影像分享</h1><p>仅已人工审核通过、可保存的 AI 纪念影像可创建公开只读链接。首次不可保存影像不能分享；公开页面持续显示 AI 标识与忆见 Logo。</p>
        {shareState === "loading" ? <p role="status">正在读取影像分享…</p> : shareState === "unavailable" ? <><p role="alert">暂时无法读取影像分享；未创建或撤销任何链接。</p><button className="quietLink" onClick={() => void loadVideoShares()}>重新读取</button></> : <><label>分享标题<input className="field" value={shareTitle} maxLength={80} onChange={(event) => setShareTitle(event.target.value)} /></label>{approved.length ? approved.map((job) => <button key={job.id} className="primaryButton" disabled={busy || !shareTitle.trim()} onClick={() => void createVideoShare(job.id)}>{busy ? "正在确认" : "为已审核影像创建链接"}</button>) : <p>当前 TA 没有可分享的已审核影像。</p>}<section><h2>当前链接</h2>{videoShares.length ? videoShares.map((share) => <article key={share.publicId}><strong>{share.title}</strong><p>公开链接只读、不可下载。仅 Owner 可选择生成带「AI Generated | MemoryAI」标识的临时副本；不会保存新的派生文件。</p><button className="quietLink" disabled={busy} onClick={() => void setVideoShareWatermarkDownload(share.publicId, !share.watermarkDownloadEnabled)}>{share.watermarkDownloadEnabled ? "关闭 Owner 水印下载" : "启用 Owner 水印下载"}</button>{share.watermarkDownloadEnabled ? <button className="quietLink" disabled={busy} onClick={() => void downloadWatermarkedVideoShare(share.publicId)}>下载 Owner 水印副本</button> : null}<button className="quietLink" disabled={busy} onClick={() => void navigator.clipboard.writeText(`${runtimeConfig.appOrigin}/video-share/${share.publicId}`).then(() => setNotice("链接已复制；请在分享前核对标题和对象。"), () => setNotice("未能复制链接；未修改分享状态。"))}>复制链接</button><button className="quietLink" disabled={busy} onClick={() => void revokeVideoShare(share.publicId)}>撤销链接</button></article>) : <p>尚无活跃分享链接。</p>}</section></>}
        {notice ? <p className="floatingNotice" role="status">{notice}</p> : null}
      </main>;
    }
    if (screen === "dataExport") return <main className="profileScene">
      <header className="pageHeader"><button className="backButton" onClick={() => setScreen("profile")}>‹</button><span>我的资料</span></header>
      <h1>下载我的资料副本</h1>
      <p>副本包含你拥有的 TA、对话、已确认拾忆、原始媒体的 Owner-only 入口、允许保存影像的授权入口、同意记录以及最小订单和退款摘要。</p>
      <p>副本不包含登录凭据、Provider 请求、对象存储路径、签名链接或内部审计资料；首次不可保存影像不会因为导出而获得下载权。</p>
      <p>为保护敏感资料，请在重新登录后的 5 分钟内手动下载。系统不会自动导出或重复下载。</p>
      {mode === "preview" ? <p role="alert">预览模式不能生成或下载资料副本。</p> : <button className="primaryButton" disabled={busy} onClick={() => void downloadAccountDataExport()}>{busy ? "正在生成资料副本" : "下载 JSON 资料副本"}</button>}
      {notice ? <p className="floatingNotice" role="status">{notice}</p> : null}
    </main>;
    if (screen === "chat" && memory) return <main className="chatScene">
      <header className="pageHeader"><button className="backButton" onClick={() => setScreen("home")}>‹</button><div><strong>{title}</strong><small>AI纪念陪伴</small></div><button className="headerAction" onClick={() => setScreen("video")}>影像</button></header>
      <div className="chatBody">{messages.length ? messages.map((message, index) => {
        const sourceIds = confirmedPickupSourceIds(message.metadata);
        return <article key={`${message.id ?? message.role}-${index}`} className={`bubble ${message.role}`}><p>{message.content}</p>{message.role === "assistant" && <><small>AI生成 · 基于已确认资料</small>{sourceIds.length > 0 && <button className="quietLink" type="button" disabled={busy} onClick={() => { setHighlightedPickupIds(sourceIds); setScreen("memory"); }}>查看记忆来源{sourceIds.length > 1 ? `（${sourceIds.length}）` : ""}</button>}<button className="quietLink" type="button" disabled={busy} onClick={() => openReplyCorrection(message.content)}>这句话不太像 {memory.name}</button></>}</article>;
      }) : <p className="emptyCopy">先创建一位你想念的人。</p>}</div>
      {replyCorrectionContent && <section className="memoryHero" aria-label="校正 TA 回复"><p className="eyebrow">校正 TA</p><h2>这句话哪里不太像 {memory.name}？</h2><p>“{replyCorrectionContent}”</p>{!replyCorrectionSuggestion ? <><fieldset disabled={busy}><legend>原因</legend>{REPLY_CORRECTION_REASONS.map((reason) => <label key={reason}><input type="radio" name="reply-correction-reason" checked={replyCorrectionReason === reason} onChange={() => setReplyCorrectionReason(reason)} /> {reason}</label>)}</fieldset><label>你确认的正确说法或资料<textarea className="field" value={replyCorrectionDetail} onChange={(event) => setReplyCorrectionDetail(event.target.value)} maxLength={800} /></label>{replyCorrectionError ? <p role="alert">{replyCorrectionError}</p> : null}<button className="primaryButton" disabled={busy} onClick={prepareReplyCorrection}>生成校正建议</button><button className="quietLink" disabled={busy} onClick={() => setReplyCorrectionContent(null)}>取消</button></> : <><p>建议写入（请先核对）：{replyCorrectionSuggestion.text}</p><p>只有确认后才会写入 TA 的正式资料；这不会改写已经发生的对话。</p>{replyCorrectionError ? <p role="alert">{replyCorrectionError}</p> : null}<button className="primaryButton" disabled={busy} onClick={() => void confirmReplyCorrection()}>{busy ? "正在确认保存" : "确认写入 TA 资料"}</button><button className="quietLink" disabled={busy} onClick={() => setReplyCorrectionSuggestion(null)}>返回修改</button></>}</section>}
      <form className="chatComposer" onSubmit={(event) => { event.preventDefault(); void sendQuestion(); }}><input value={question} onChange={(event) => { setQuestion(event.target.value); setQuestionIdempotencyKey(null); }} placeholder="想说些什么" disabled={busy} /><button disabled={!question.trim() || busy}>发送</button></form>
      {notice ? <p className="floatingNotice">{notice}</p> : null}<BottomNav active="chat" onChange={setScreen} hasMemory={hasMemory} />
    </main>;
    if (screen === "profile" && profileState !== "idle") return <main className="profileScene">
      <p className="eyebrow">我的</p>
      <h1>资料与偏好</h1>
      <button className="quietLink" type="button" disabled={busy || mode === "preview"} onClick={() => setScreen("dataExport")}>下载我的资料副本</button>
      <button className="quietLink" type="button" disabled={busy || mode === "preview" || !memory} onClick={() => { setScreen("videoShares"); void loadVideoShares(); }}>管理影像分享</button>
      <p>每一段已确认资料都只在你的授权范围内使用。</p>
      <section>
        <h2>当前 TA</h2>
        {!memory ? <p>还没有可编辑的 TA。</p> : taProfileEditing && taProfileDraft ? <><p>只编辑你已确认的资料；保存后只影响之后的回复，不改写历史对话。</p><label>名称<input className="field" value={taProfileDraft.name} onChange={(event) => updateTaProfileDraft("name", event.target.value)} /></label><label>与你的关系<input className="field" value={taProfileDraft.relationship} onChange={(event) => updateTaProfileDraft("relationship", event.target.value)} /></label><label>性格<textarea className="field" value={taProfileDraft.personalityProfile ?? ""} onChange={(event) => updateTaProfileDraft("personalityProfile", event.target.value)} /></label><label>表达习惯<textarea className="field" value={taProfileDraft.speechStyle ?? ""} onChange={(event) => updateTaProfileDraft("speechStyle", event.target.value)} /></label><label>常说的话<textarea className="field" value={taProfileDraft.catchPhrases ?? ""} onChange={(event) => updateTaProfileDraft("catchPhrases", event.target.value)} /></label><label>已确认的共同经历<textarea className="field" value={taProfileDraft.lifeStory ?? ""} onChange={(event) => updateTaProfileDraft("lifeStory", event.target.value)} /></label><button className="primaryButton" disabled={busy || !taProfileDraft.name.trim() || !taProfileDraft.relationship.trim()} onClick={() => void saveTaProfile()}>{busy ? "正在保存" : "保存 TA 资料"}</button><button className="quietLink" disabled={busy} onClick={() => setTaProfileEditing(false)}>取消</button></> : <><p>{memory.name} · {memory.relationship}</p><button className="quietLink" disabled={busy} onClick={beginTaProfileEdit}>编辑 TA 资料</button></>}
      </section>
      <section>
        <h2>生日</h2>
        <p>用于年龄保护和你明确选择的纪念日规则；可以随时修改。</p>
        {mode === "preview" ? <p>预览模式不会保存个人资料。</p> : profileState === "loading" ? <p role="status">正在读取个人资料…</p> : profileState === "unavailable" ? <><p role="alert">个人资料暂时无法读取，未显示或修改任何旧值。</p><button className="quietLink" disabled={busy} onClick={() => setProfileReadAttempt((current) => current + 1)}>重新读取个人资料</button></> : <><label>生日<input className="field" value={birthDate} onChange={(event) => setBirthDate(event.target.value)} inputMode="numeric" placeholder="YYYY-MM-DD" /></label><button className="primaryButton" disabled={busy || !birthDate} onClick={() => void saveBirthDate()}>{busy ? "正在保存" : "保存生日"}</button></>}
      </section>
      <section>
        <h2>账户注销</h2>
        <p>注销完成后，剩余付费、邀请和节日影像额度及奖励机会会清零且无法恢复。订单、退款、发票和法定记录会与内容资料隔离。</p>
        {mode === "preview" ? <p>预览模式不能发起或显示注销。</p> : deletionState === "loading" ? <p role="status">正在读取注销进度…</p> : deletionState === "unavailable" ? <><p role="alert">注销服务暂时不可用，未提交任何注销申请。</p><button className="quietLink" disabled={busy} onClick={() => setDeletionReadAttempt((current) => current + 1)}>重新读取注销进度</button></> : deletionProgress ? <><p role="status">当前状态：{deletionProgress.status}{deletionProgress.legalHold ? "；部分资料受法定保全范围限制，不会用于产品功能。" : ""}</p><p>在线内容不晚于 {new Date(deletionProgress.contentDeleteAfter).toLocaleDateString("zh-CN")} 删除；外部对象不晚于 {new Date(deletionProgress.providerDeleteAfter).toLocaleDateString("zh-CN")} 删除；备份最长保留至 {new Date(deletionProgress.backupExpireAfter).toLocaleDateString("zh-CN")}。</p><button className="quietLink" disabled={busy} onClick={() => setDeletionReadAttempt((current) => current + 1)}>刷新注销进度</button></> : deletionConfirming ? <><p role="alert">确认后将立即撤销所有登录 Session 和设备访问。系统不会自动重试提交。</p><button className="primaryButton" disabled={busy} onClick={() => void submitAccountDeletion()}>{busy ? "正在提交" : "确认注销账户"}</button><button className="quietLink" disabled={busy} onClick={() => setDeletionConfirming(false)}>取消</button></> : <button className="quietLink" disabled={busy} onClick={() => setDeletionConfirming(true)}>申请注销账户</button>}
      </section>
      <section><h2>危机支持设置</h2><p>忆见安全陪伴助手不会替代紧急服务，也不会替你联系任何人。你可预授权仅含最小信息的内部支持队列；外部联络不会自动发生。</p>{mode === "preview" ? <p>预览模式不会保存危机支持设置。</p> : crisisState === "loading" ? <p role="status">正在读取危机支持设置…</p> : crisisState === "unavailable" ? <><p role="alert">危机支持设置暂时无法读取；未创建或变更任何授权。</p><button className="quietLink" onClick={() => void refreshCrisisSupport()}>重新读取</button></> : <><button className="quietLink" disabled={busy} onClick={() => void (async () => { setBusy(true); try { await productApi.setCrisisSupport(!crisisSupportEnabled); await refreshCrisisSupport(); setNotice(crisisSupportEnabled ? "已撤销危机支持预授权。" : "已预授权最小化内部危机支持队列；这不代表已通知任何人。"); } catch (error) { setNotice(friendlyError(error)); } finally { setBusy(false); } })()}>{crisisSupportEnabled ? "撤销危机支持预授权" : "预授权内部危机支持"}</button><label>可信联系人的忆见账户标识<input className="field" value={crisisContactExternalId} onChange={(event) => setCrisisContactExternalId(event.target.value)} /></label><button className="quietLink" disabled={busy || !crisisContactExternalId.trim()} onClick={() => void (async () => { setBusy(true); try { await productApi.requestCrisisContact(crisisContactExternalId.trim()); setCrisisContactExternalId(""); await refreshCrisisSupport(); setNotice("联系人申请已记录；对方需自行登录并明确接受，系统不会自动通知。" ); } catch (error) { setNotice(friendlyError(error)); } finally { setBusy(false); } })()}>发起联系人申请</button><ul>{crisisContacts.map((contact) => <li key={contact.id}>{contact.status === "accepted" ? "已接受" : contact.status === "pending" ? "等待对方接受" : "已撤销"}{contact.status === "pending" && contact.role === "contact" && <button className="quietLink" disabled={busy} onClick={() => void productApi.updateCrisisContact(contact.id, "accept").then(refreshCrisisSupport).catch((error) => setNotice(friendlyError(error)))}>接受</button>}{contact.status !== "revoked" && <button className="quietLink" disabled={busy} onClick={() => void productApi.updateCrisisContact(contact.id, "revoke").then(refreshCrisisSupport).catch((error) => setNotice(friendlyError(error)))}>撤销</button>}</li>)}</ul></>}</section>
      <section><h2>隐私与安全</h2><p>数据导出和分享设置仍通过同一受保护账户合同完成；移动端不会伪造已提交、已删除或已通知。</p><a className="quietLink" href="/privacy">查看隐私与删除说明</a><a className="quietLink" href="/help">查看帮助与安全说明</a></section>
      {notice ? <p className="floatingNotice">{notice}</p> : null}<BottomNav active="profile" onChange={setScreen} hasMemory={hasMemory} />
    </main>;
    if (screen === "splash") return <BrandSplash />;
    if (screen === "offline") return <Offline retry={() => {
      if (!navigator.onLine) return;
      setOnline(true);
      setReconnectAttempt((current) => current + 1);
    }} />;
    if (screen === "unavailable") return <ServiceUnavailable retry={() => {
      if (!navigator.onLine) { setScreen("offline"); return; }
      setReconnectAttempt((current) => current + 1);
    }} />;
    if (screen === "debug" && DebugLab) return <Suspense fallback={<BrandSplash />}><DebugLab /></Suspense>;
    if (screen === "welcome") return <main className="welcomeScene">
      <div className="nightWindow" aria-hidden="true" /><p className="eyebrow">忆见</p><h1>把想起的人，<br />好好记在这里。</h1>
      <p>从一段你愿意确认的真实资料开始，创建清楚标注的 AI 纪念陪伴。</p><button className="primaryButton" onClick={() => press(() => setScreen("login"))}>开始记录</button>
    </main>;
    if (screen === "login" || screen === "code") return <main className="authScene">
      <button className="backButton" onClick={() => setScreen("welcome")}>‹</button><p className="eyebrow">忆见</p>
      <h1>{screen === "login" ? "用手机号继续" : "输入验证码"}</h1>
      <p>{screen === "login" ? "登录后，你可以创建 TA、保存记忆，并在需要的时候继续对话。" : `验证码已发送至 ${phone}`}</p>
      {screen === "login" ? <input className="field" value={phone} onChange={(event) => setPhone(event.target.value.replace(/\D/g, "").slice(0, 11))} inputMode="tel" placeholder="请输入手机号" autoFocus /> : <input className="field codeField" value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))} inputMode="numeric" placeholder="6 位验证码" autoFocus />}
      {notice ? <p className="notice">{notice}</p> : null}
      <button className="primaryButton" disabled={busy} onClick={() => void (screen === "login" ? sendCode() : verifyCode())}>{busy ? "请稍候" : screen === "login" ? "获取验证码" : "进入忆见"}</button>
      {__MOBILE_DEBUG_BUILD__ && screen === "login" ? <button className="quietLink" onClick={beginPreview}>在此设备预览产品流程</button> : null}
    </main>;
    if (screen === "complete" && resumingMemory) return <main className="createScene">
      <header className="pageHeader"><button className="backButton" onClick={() => setScreen("home")}>‹</button><span>补充照片</span><small>待完成</small></header>
      <div className="presencePlaceholder"><span>{initials(resumingMemory.name)}</span></div><h1>为 {resumingMemory.name} 补充一张照片。</h1><p>照片保存并由服务端确认后，才会继续首次问候。</p>
      <button className="mediaChoice" disabled={busy || Boolean(pendingCreation?.uploadedMediaUris.length)} onClick={() => void chooseMedia()}><span>照片</span><small>{media.length ? `已选 ${media.length} 张照片` : "从系统相册重新选择；不录音或上传声音"}</small></button>
      {notice ? <p className="notice">{notice}</p> : null}<button className="primaryButton" disabled={busy} onClick={() => void createMemory()}>{busy ? "正在保存" : pendingCreation ? "继续保存素材" : "保存照片"}</button>
    </main>;
    if (screen === "create") return <main className="createScene">
      <header className="pageHeader"><button className="backButton" onClick={() => setScreen("home")}>‹</button><span>创建 TA</span><small>1 / 1</small></header>
      <div className="presencePlaceholder"><span>{initials(name || "TA")}</span></div><h1>先把 TA 写下来。</h1><p>只记录你愿意确认的真实片段，其他内容可以慢慢补充。</p>
      <label>TA 的名字<input className="field" value={name} onChange={(event) => setName(event.target.value)} placeholder="姓名或昵称" /></label>
      <label>你们的关系<input className="field" value={relationship} onChange={(event) => setRelationship(event.target.value)} placeholder="例如：母亲、朋友" /></label>
      <label>一段想说的话<textarea className="field" value={story} onChange={(event) => setStory(event.target.value)} placeholder="写下一件你们共同经历过的事" rows={3} /></label>
      <button className="mediaChoice" disabled={busy || Boolean(pendingCreation?.uploadedMediaUris.length)} onClick={() => void chooseMedia()}><span>照片</span><small>{media.length ? `已选 ${media.length} 张照片` : "从系统相册选择；不录音或上传声音"}</small></button>
      {notice ? <p className="notice">{notice}</p> : null}<button className="primaryButton" disabled={busy} onClick={() => void createMemory()}>{busy ? "正在保存" : pendingCreation ? "继续保存素材" : "保存 TA 资料"}</button>
    </main>;
    if (screen === "presence" && memory) return <main className="presenceScene">
      <div className="presenceLight" aria-hidden="true" /><p className="eyebrow">AI 纪念资料已准备好</p><div className="personFrame"><span>{initials(memory.name)}</span></div><h1>{memory.name}</h1><p>{memory.relationship} · 已被好好记下</p>
      <blockquote>“{memory.lifeStory || "你愿意留下的每一段已确认资料，都可以慢慢整理。"}”</blockquote>
      <button className="primaryButton" onClick={() => press(() => setScreen("chat"))}>开始 AI 纪念对话</button><button className="quietLink" onClick={() => setScreen("video")}>查看影像机会</button><button className="quietLink" onClick={() => setScreen("memory")}>进入拾忆</button>
    </main>;
    if (screen === "chat") return <main className="chatScene">
      <header className="pageHeader"><button className="backButton" onClick={() => setScreen("home")}>‹</button><div><strong>{title}</strong><small>AI纪念陪伴</small></div><button className="headerAction" onClick={() => setScreen("video")}>影像</button></header>
      <div className="chatBody">{memory ? <div className="chatPortrait">{initials(memory.name)}</div> : null}{messages.length ? messages.map((message, index) => <p key={`${message.role}-${index}`} className={`bubble ${message.role}`}>{message.content}</p>) : <p className="emptyCopy">先创建一位你想念的人。</p>}</div>
      <form className="chatComposer" onSubmit={(event) => { event.preventDefault(); void sendQuestion(); }}><input value={question} onChange={(event) => { setQuestion(event.target.value); setQuestionIdempotencyKey(null); }} placeholder="想说些什么" disabled={!memory || busy} /><button disabled={!question.trim() || busy}>发送</button></form>
      {notice ? <p className="floatingNotice">{notice}</p> : null}<BottomNav active="chat" onChange={setScreen} hasMemory={hasMemory} />
    </main>;
    if (screen === "video" && memory) {
      return <VideoOpportunityScreen
        memory={memory}
        ownedMemories={ownedMemories}
        conversation={conversation}
        isFirstMemory={isFirstMemory}
        online={online && productApi.enabled()}
        onBack={() => setScreen("memory")}
        onOpenChat={() => setScreen("chat")}
        onSelectMemory={(memoryId) => { if (memoryId !== memory.id) void openMemory(memoryId, "video"); }}
      />;
    }
    if (screen === "video") return <main className="memoryScene"><section className="emptyMemory"><h1>还没有一段记忆。</h1><p>从你最想念的人开始。</p><button className="primaryButton" onClick={beginCreateMemory}>创建 TA</button></section></main>;
    if (screen === "memory") return <main className="memoryScene">
      <header className="pageHeader"><button className="backButton" onClick={() => setScreen("home")}>‹</button><span>拾忆</span><button className="headerAction" onClick={() => setScreen("video")}>影像</button></header>
      {memory ? <section className="memoryHero"><div className="personFrame small"><span>{initials(memory.name)}</span></div><p className="eyebrow">忆见整理助手 · 为 {memory.name} 整理资料</p><h1>把想起的事留在这里。</h1><p>你说，忆见帮你整理。只有经过你确认，才会成为 TA 可以引用的资料；忆见不会从普通聊天自动收集，也不会猜测空缺。</p>
        {!editingPickupId && <section aria-label="从一张照片说起"><h2>从一张照片说起</h2><p>只显示当前 TA 已上传且服务端确认的照片。选择后，只有在你确认保存时才会关联为来源；不会读取相册、麦克风或录音。</p>{pickupPhotoSources.length === 0 ? <p role="status">还没有可选择的已上传照片。你仍可从一件小事开始讲述。</p> : <div>{pickupPhotoSources.map((photo, index) => <button key={photo.id} className="quietLink" type="button" aria-pressed={selectedPickupPhotoAssetId === photo.id} disabled={busy} onClick={() => { setSelectedPickupPhotoAssetId(photo.id); setPickupRequestIdempotencyKey(null); }}> {selectedPickupPhotoAssetId === photo.id ? "已选择" : "选择"}照片 {index + 1} · {new Date(photo.createdAt).toLocaleDateString("zh-CN")}</button>)}</div>}</section>}
        <label>你的原话<textarea className="field" value={pickupOriginalText} onChange={(event) => { setPickupOriginalText(event.target.value); setPickupRequestIdempotencyKey(null); }} placeholder="写下你愿意确认的一件小事" rows={4} maxLength={8000} /></label>
        {!pickupFollowUpAsked && pickupOriginalText.trim() && <button className="quietLink" type="button" onClick={() => setPickupFollowUpAsked(true)}>忆见可以追问一件事</button>}
        {pickupFollowUpAsked && <p>忆见想确认一件事：这件事大约发生在什么时候？你可以直接补充在原话里；每次整理最多提出这一项追问。</p>}
        <button className="quietLink" type="button" disabled={!pickupOriginalText.trim()} onClick={() => { setPickupOrganizedText(pickupDraft(pickupOriginalText)); setPickupRequestIdempotencyKey(null); }}>按原话分段整理草稿</button>
        <label>整理稿（请核对后编辑）<textarea className="field" value={pickupOrganizedText} onChange={(event) => { setPickupOrganizedText(event.target.value); setPickupRequestIdempotencyKey(null); }} placeholder="整理稿不会自动成为可引用资料" rows={5} maxLength={8000} /></label>
        <label><input type="checkbox" checked={pickupConfirmed} onChange={(event) => setPickupConfirmed(event.target.checked)} /> 我确认原话与整理稿准确，允许忆见将此资料作为可追溯回复来源。</label>
        <button className="primaryButton" disabled={busy || !mayConfirmPickup(pickupOriginalText, pickupOrganizedText, pickupConfirmed)} onClick={() => void savePickup()}>{busy ? "正在保存" : editingPickupId ? "保存编辑" : "确认并保存"}</button>{editingPickupId && <button className="quietLink" type="button" onClick={resetPickupDraft}>取消编辑</button>}
        <h2>已确认资料</h2>{highlightedPickupIds.length > 0 && <p role="status">以下是本条回复引用的、你已确认的资料；删除后将不再供 TA 引用。</p>}{highlightedPickupIds.length > 0 && pickups.length > 0 && !pickups.some((pickup) => highlightedPickupIds.includes(pickup.id)) && <p role="alert">这条已确认资料已被删除，不能再查看或被 TA 引用。</p>}{pickups.length === 0 ? <p>还没有已确认资料。</p> : pickups.map((pickup) => <article key={pickup.id} data-memory-source-highlighted={highlightedPickupIds.includes(pickup.id) || undefined}><h3>原话</h3><p>{pickup.originalText}</p><h3>整理稿</h3><p>{pickup.organizedText}</p><small>来源：你的主动讲述 · 叙述者：你 · 记录于 {new Date(pickup.createdAt).toLocaleString("zh-CN")}</small>{pickup.photoAssetId ? <small> · 附带来源：你确认选择的已上传照片</small> : null}<div><button className="quietLink" type="button" onClick={() => editPickup(pickup)}>编辑</button><button className="quietLink" type="button" disabled={busy} onClick={() => void removePickup(pickup)}>删除</button></div></article>)}</section> : <section className="emptyMemory"><h1>还没有一段记忆。</h1><p>从你最想念的人开始。</p><button className="primaryButton" onClick={beginCreateMemory}>创建 TA</button></section>}
      {notice ? <p className="floatingNotice">{notice}</p> : null}<BottomNav active="memory" onChange={setScreen} hasMemory={hasMemory} />
    </main>;
    if (screen === "profile") return <main className="profileScene"><p className="eyebrow">我的</p><h1>资料与偏好</h1><p>每一段已确认资料都只在你的授权范围内使用。</p><section><h2>生日</h2><p>用于年龄保护和你明确选择的纪念日规则；可以随时修改。</p>{mode === "preview" ? <p>预览模式不会保存个人资料。</p> : profileState === "loading" ? <p role="status">正在读取个人资料…</p> : profileState === "unavailable" ? <p role="alert">个人资料暂时无法读取，未显示或修改任何旧值。</p> : <><label>生日<input className="field" value={birthDate} onChange={(event) => setBirthDate(event.target.value)} inputMode="numeric" placeholder="YYYY-MM-DD" /></label><button className="primaryButton" disabled={busy || !birthDate} onClick={() => void saveBirthDate()}>{busy ? "正在保存" : "保存生日"}</button></>}</section><section><h2>隐私与安全</h2><p>注销、导出、危机支持授权和分享设置需要通过受保护的网页账户设置完成；移动端不会伪造已提交或已删除。</p><a className="quietLink" href="/privacy">查看隐私与删除说明</a><a className="quietLink" href="/help">查看帮助与安全说明</a></section>{notice ? <p className="floatingNotice">{notice}</p> : null}<BottomNav active="profile" onChange={setScreen} hasMemory={hasMemory} /></main>;
    return <main className="homeScene"><p className="eyebrow">忆见</p><div className="homeSpace"><div className="homeGlow" aria-hidden="true" />{memory ? <><button className="personFrame" type="button" aria-haspopup="dialog" aria-expanded={primarySelectorOpen} onClick={() => setPrimarySelectorOpen(true)}><span>{initials(memory.name)}</span></button><p>AI纪念资料：{memory.name}</p><button className="quietLink" type="button" onClick={() => setPrimarySelectorOpen(true)}>切换或设为主 TA</button></> : <><div className="emptyPortrait" /><h1>为谁，留一盏灯？</h1><p>从一个名字、一句你确认的资料开始记录。</p></>}</div>
      {primarySelectorOpen && <section role="dialog" aria-modal="true" aria-label="选择主 TA" className="memoryHero"><h2>选择主 TA</h2><p>只显示本次登录后服务端确认属于你的 TA；此选择只保存为本设备展示偏好。</p>{ownedMemories.map((candidate) => <button key={candidate.id} className="quietLink" type="button" disabled={busy || candidate.id === memory?.id} onClick={() => void openMemory(candidate.id, "home", true)}>{candidate.name}{candidate.id === memory?.id ? "（当前主 TA）" : ""}</button>)}<button className="quietLink" type="button" onClick={() => setPrimarySelectorOpen(false)}>取消</button></section>}
      <button className="primaryButton" onClick={() => press(() => incompleteMemory ? continueIncompleteMemory() : memory ? setScreen("chat") : beginCreateMemory())}>{hasIncompleteMemory ? "继续补充照片" : memory ? "继续查看" : "创建 TA"}</button>{notice ? <p className="floatingNotice">{notice}</p> : null}<BottomNav active="home" onChange={setScreen} hasMemory={hasMemory} />
    </main>;
  }, [beginTaProfileEdit, birthDate, busy, challengeId, code, conversation, createVideoShare, crisisContactExternalId, crisisContacts, crisisState, crisisSupportEnabled, deletionConfirming, deletionProgress, deletionState, downloadAccountDataExport, downloadWatermarkedVideoShare, hasMemory, incompleteMemory, isFirstMemory, loadVideoShares, media.length, memory, messages, mode, name, notice, online, ownedMemories, pendingCreation, phone, primarySelectorOpen, profileState, question, refreshCrisisSupport, relationship, resumingMemory, revokeVideoShare, saveTaProfile, screen, setVideoShareWatermarkDownload, shareJobs, shareState, shareTitle, story, submitAccountDeletion, taProfileDraft, taProfileEditing, title, updateTaProfileDraft, videoShares]);

  return <div className={`appRoot ${productOnline ? "isOnline" : ""}`}>{content}</div>;
}
