import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { App as NativeApp } from "@capacitor/app";
import { Haptics, ImpactStyle } from "@capacitor/haptics";
import { Share } from "@capacitor/share";
import { runtimeConfig } from "./config/environment";
import { MemoryMedia, type PickedMedia, saveSignedVideo } from "./native/memory-media";
import {
  productApi,
  ProductApiError,
  type ProductConversation,
  type ProductMemory,
} from "./product/api";
import {
  CreationFlowError,
  type PendingCreation,
  requestServerGreeting,
  startPendingCreation,
  uploadPendingMedia,
} from "./product/creation-flow";
import { classifyOwnedMemories, findIncompleteMemory, isIncompleteMemory, resumePendingCreation } from "./product/incomplete-memory";
import { VideoOpportunityScreen } from "./product/VideoOpportunityScreen";

const DebugLab = __MOBILE_DEBUG_BUILD__
  ? lazy(() => import("./debug/NativeCapabilityLab").then((module) => ({ default: module.NativeCapabilityLab })))
  : null;

type Screen = "splash" | "welcome" | "login" | "code" | "home" | "create" | "complete" | "presence" | "chat" | "memory" | "video" | "profile" | "offline" | "debug";
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

function press(action: () => void) {
  void Haptics.impact({ style: ImpactStyle.Light }).catch(() => undefined);
  action();
}

function BrandSplash() {
  return <main className="brandSplash" aria-label="忆见">
    <div className="brandHalo" aria-hidden="true" />
    <div className="brandMark"><span>忆见</span><small>MEMORYAI</small></div>
    <p>让想念的人，继续陪伴。</p>
  </main>;
}

function Offline({ retry }: { retry: () => void }) {
  return <main className="offlineScene">
    <div className="quietDot" aria-hidden="true" />
    <p className="eyebrow">忆见</p>
    <h1>此刻没有网络。</h1>
    <p>你已写下的内容会留在这里。等连接恢复后，再继续和 TA 相见。</p>
    <button className="textButton" onClick={retry}>重新连接</button>
  </main>;
}

function BottomNav({ active, onChange, hasMemory }: { active: Screen; onChange: (screen: Screen) => void; hasMemory: boolean }) {
  const items: Array<[Screen, string, string]> = [
    ["home", "⌂", "首页"],
    ["chat", "·", "聊天"],
    ["memory", "◌", "记忆"],
    ["profile", "○", "我的"],
  ];
  return <nav className="bottomNav" aria-label="主导航">
    {items.map(([screen, icon, label]) => <button key={screen} className={active === screen ? "active" : ""} onClick={() => press(() => onChange(screen))}>
      <span>{icon}</span><small>{label}</small>{screen !== "profile" && screen !== "home" && !hasMemory ? <i /> : null}
    </button>)}
  </nav>;
}

export function App() {
  const [screen, setScreen] = useState<Screen>("splash");
  const [online, setOnline] = useState(() => navigator.onLine);
  const [mode, setMode] = useState<SessionMode>("remote");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [challengeId, setChallengeId] = useState("");
  const [memory, setMemory] = useState<ProductMemory | null>(null);
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
  const [previewVideoUrl, setPreviewVideoUrl] = useState<string | null>(null);

  const hasMemory = Boolean(memory);
  const hasIncompleteMemory = Boolean(incompleteMemory);
  const title = memory?.name || "TA";
  const isFirstMemory = Boolean(memory && firstOwnedMemoryId === memory.id);
  const messages = conversation.messages;
  const productOnline = online && (mode === "preview" || productApi.enabled());

  const loadOwnedMemories = useCallback(async () => {
    const memories = await productApi.listMemories();
    const { active: restoredMemory, incomplete } = classifyOwnedMemories(memories);
    const restoredConversation = restoredMemory && !isIncompleteMemory(restoredMemory)
      ? await productApi.getConversation(restoredMemory.id)
      : { sessionId: null, messages: [] };
    return { memories, incomplete, restoredMemory, restoredConversation };
  }, []);

  const applyOwnedMemories = useCallback((restored: Awaited<ReturnType<typeof loadOwnedMemories>>) => {
    setMode("remote");
    setMemory(restored.restoredMemory);
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
        if (active) setScreen("welcome");
      }
    };
    const finish = window.setTimeout(() => { void restoreSession(); }, 1000);
    const onOnline = () => { setOnline(true); void restoreSession(); };
    const onOffline = () => { setOnline(false); setScreen("offline"); };
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => { active = false; window.clearTimeout(finish); window.removeEventListener("online", onOnline); window.removeEventListener("offline", onOffline); };
  }, [applyOwnedMemories, loadOwnedMemories]);

  const openMemory = useCallback(async (id: string, destination: "memory" | "video" = "memory") => {
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
      setMemory(ownedMemory);
      setIncompleteMemory(incomplete);
      setResumingMemory(null);
      setConversation(restoredConversation);
      setFirstOwnedMemoryId(firstMemoryId(memories));
      setMode("remote");
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

  useEffect(() => {
    if (!__MOBILE_DEBUG_BUILD__ || mode !== "preview") return;
    void import("./debug/productPreview").then(({ debugPreviewVideoUrl }) => setPreviewVideoUrl(debugPreviewVideoUrl()));
  }, [mode]);

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
        setConversation({ sessionId: null, messages: [{ role: "assistant", content: `我在。关于${created.name}，你想先从哪一段记忆开始？` }] });
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
    setQuestion("");
    setBusy(true);
    try {
      if (mode === "preview") {
        setConversation((current) => ({
          ...current,
          sessionId: null,
          messages: [...current.messages, { role: "assistant", content: "我记得你说过的这些。慢慢说，我一直在听。" }],
        }));
      } else {
        await productApi.askMemory(memory.id, value);
        setConversation(await productApi.getConversation(memory.id));
      }
    } catch (error) { setNotice(friendlyError(error)); }
    finally { setBusy(false); }
  };

  const saveVideo = async () => {
    if (!previewVideoUrl) { setNotice("影像准备好后，就可以保存到系统相册。 "); return; }
    setBusy(true); setNotice("");
    try { await saveSignedVideo({ signedUrl: previewVideoUrl, fileName: "yijian-memory.mp4", mimeType: "video/mp4" }); setNotice("影像已保存到系统相册。"); }
    catch { setNotice("暂时无法保存这段影像，请稍后再试。"); }
    finally { setBusy(false); }
  };

  const shareVideo = async () => {
    try { await Share.share({ title: `${title} 的影像`, text: "忆见里的一段珍贵记忆" }); }
    catch { setNotice("分享已取消。"); }
  };

  const content = useMemo(() => {
    if (screen === "splash") return <BrandSplash />;
    if (screen === "offline") return <Offline retry={() => setScreen(navigator.onLine ? "welcome" : "offline")} />;
    if (screen === "debug" && DebugLab) return <Suspense fallback={<BrandSplash />}><DebugLab /></Suspense>;
    if (screen === "welcome") return <main className="welcomeScene">
      <div className="nightWindow" aria-hidden="true" /><p className="eyebrow">忆见</p><h1>让想念的人，<br />继续陪伴。</h1>
      <p>从一段真实的记忆开始，把 TA 留在你的日常里。</p><button className="primaryButton" onClick={() => press(() => setScreen("login"))}>开始相见</button>
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
      <button className="mediaChoice" disabled={busy || Boolean(pendingCreation?.uploadedMediaUris.length)} onClick={() => void chooseMedia()}><span>照片与声音</span><small>{media.length ? `已选 ${media.length} 项素材` : "从系统相册重新选择"}</small></button>
      {notice ? <p className="notice">{notice}</p> : null}<button className="primaryButton" disabled={busy} onClick={() => void createMemory()}>{busy ? "正在保存" : pendingCreation ? "继续保存素材" : "保存照片"}</button>
    </main>;
    if (screen === "create") return <main className="createScene">
      <header className="pageHeader"><button className="backButton" onClick={() => setScreen("home")}>‹</button><span>创建 TA</span><small>1 / 1</small></header>
      <div className="presencePlaceholder"><span>{initials(name || "TA")}</span></div><h1>先把 TA 写下来。</h1><p>只记录你愿意确认的真实片段，其他内容可以慢慢补充。</p>
      <label>TA 的名字<input className="field" value={name} onChange={(event) => setName(event.target.value)} placeholder="姓名或昵称" /></label>
      <label>你们的关系<input className="field" value={relationship} onChange={(event) => setRelationship(event.target.value)} placeholder="例如：母亲、朋友" /></label>
      <label>一段想说的话<textarea className="field" value={story} onChange={(event) => setStory(event.target.value)} placeholder="写下一件你们共同经历过的事" rows={3} /></label>
      <button className="mediaChoice" disabled={busy || Boolean(pendingCreation?.uploadedMediaUris.length)} onClick={() => void chooseMedia()}><span>照片与声音</span><small>{media.length ? `已选 ${media.length} 项素材` : "从系统相册选择"}</small></button>
      {notice ? <p className="notice">{notice}</p> : null}<button className="primaryButton" disabled={busy} onClick={() => void createMemory()}>{busy ? "正在靠近" : pendingCreation ? "继续保存素材" : "让 TA 出现"}</button>
    </main>;
    if (screen === "presence" && memory) return <main className="presenceScene">
      <div className="presenceLight" aria-hidden="true" /><p className="eyebrow">一段新的陪伴正在开始</p><div className="personFrame"><span>{initials(memory.name)}</span></div><h1>{memory.name}</h1><p>{memory.relationship} · 已被好好记下</p>
      <blockquote>“{memory.lifeStory || "你愿意留下的每一段记忆，都会慢慢成为相见的地方。"}”</blockquote>
      <button className="primaryButton" onClick={() => press(() => setScreen("chat"))}>和 TA 说句话</button><button className="quietLink" onClick={() => setScreen("video")}>查看影像机会</button><button className="quietLink" onClick={() => setScreen("memory")}>进入记忆</button>
    </main>;
    if (screen === "chat") return <main className="chatScene">
      <header className="pageHeader"><button className="backButton" onClick={() => setScreen("home")}>‹</button><div><strong>{title}</strong><small>正在陪伴</small></div><button className="headerAction" onClick={() => setScreen("video")}>影像</button></header>
      <div className="chatBody">{memory ? <div className="chatPortrait">{initials(memory.name)}</div> : null}{messages.length ? messages.map((message, index) => <p key={`${message.role}-${index}`} className={`bubble ${message.role}`}>{message.content}</p>) : <p className="emptyCopy">先创建一位你想念的人。</p>}</div>
      <form className="chatComposer" onSubmit={(event) => { event.preventDefault(); void sendQuestion(); }}><input value={question} onChange={(event) => setQuestion(event.target.value)} placeholder="想和 TA 说些什么" disabled={!memory || busy} /><button disabled={!question.trim() || busy}>发送</button></form>
      {notice ? <p className="floatingNotice">{notice}</p> : null}<BottomNav active="chat" onChange={setScreen} hasMemory={hasMemory} />
    </main>;
    if (screen === "video" && memory) {
      if (mode === "preview") return <main className="memoryScene">
        <header className="pageHeader"><button className="backButton" onClick={() => setScreen("home")}>‹</button><span>影像</span><button className="headerAction" onClick={() => setScreen("memory")}>详情</button></header>
        <section className="galleryScene"><p className="eyebrow">影像</p><h1>把瞬间，留在身边。</h1>{previewVideoUrl ? <article className="videoCard"><div><span>回忆片段</span><small>{memory.name} · 一段被珍藏的时光</small></div><button onClick={() => void saveVideo()} disabled={busy}>保存到相册</button><button className="secondaryButton" onClick={() => void shareVideo()}>分享</button></article> : <p className="emptyCopy">影像准备好后，会安静地留在这里。</p>}</section>
      </main>;
      return <VideoOpportunityScreen
        memory={memory}
        conversation={conversation}
        isFirstMemory={isFirstMemory}
        online={online && productApi.enabled()}
        onBack={() => setScreen("memory")}
        onOpenChat={() => setScreen("chat")}
      />;
    }
    if (screen === "video") return <main className="memoryScene"><section className="emptyMemory"><h1>还没有一段记忆。</h1><p>从你最想念的人开始。</p><button className="primaryButton" onClick={beginCreateMemory}>创建 TA</button></section></main>;
    if (screen === "memory") return <main className="memoryScene">
      <header className="pageHeader"><button className="backButton" onClick={() => setScreen("home")}>‹</button><span>记忆</span><button className="headerAction" onClick={() => setScreen("video")}>影像</button></header>
      {memory ? <section className="memoryHero"><div className="personFrame small"><span>{initials(memory.name)}</span></div><p className="eyebrow">{memory.relationship}</p><h1>{memory.name}</h1><p>{memory.lifeStory || "这段记忆正在慢慢长出新的形状。"}</p>{incompleteMemory?.id === memory.id ? <button className="primaryButton" onClick={continueIncompleteMemory}>继续补充照片</button> : <button className="primaryButton" onClick={() => setScreen("chat")}>继续对话</button>}</section> : <section className="emptyMemory"><h1>还没有一段记忆。</h1><p>从你最想念的人开始。</p><button className="primaryButton" onClick={beginCreateMemory}>创建 TA</button></section>}
      {notice ? <p className="floatingNotice">{notice}</p> : null}<BottomNav active="memory" onChange={setScreen} hasMemory={hasMemory} />
    </main>;
    if (screen === "profile") return <main className="profileScene"><p className="eyebrow">我的</p><h1>把陪伴，慢慢留住。</h1><section><span>资料与偏好</span><span>隐私与授权</span><span>关于忆见</span></section><p>每一段记忆都只为你和 TA 而存在。</p><BottomNav active="profile" onChange={setScreen} hasMemory={hasMemory} /></main>;
    return <main className="homeScene"><p className="eyebrow">忆见</p><div className="homeSpace"><div className="homeGlow" aria-hidden="true" />{memory ? <><div className="personFrame"><span>{initials(memory.name)}</span></div><p>{memory.name} 在这里</p></> : <><div className="emptyPortrait" /><h1>为谁，留一盏灯？</h1><p>从一个名字、一句常说的话，开始重新靠近。</p></>}</div>
      <button className="primaryButton" onClick={() => press(() => incompleteMemory ? continueIncompleteMemory() : memory ? setScreen("chat") : beginCreateMemory())}>{hasIncompleteMemory ? "继续补充照片" : memory ? "继续相见" : "创建 TA"}</button>{notice ? <p className="floatingNotice">{notice}</p> : null}<BottomNav active="home" onChange={setScreen} hasMemory={hasMemory} />
    </main>;
  }, [busy, challengeId, code, conversation, hasMemory, incompleteMemory, isFirstMemory, media.length, memory, messages, mode, name, notice, online, pendingCreation, phone, previewVideoUrl, question, relationship, resumingMemory, screen, story, title]);

  return <div className={`appRoot ${productOnline ? "isOnline" : ""}`}>{content}</div>;
}
