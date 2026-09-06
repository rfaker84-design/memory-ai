"use client";

import { FormEvent, ReactNode, useState } from "react";
import { useRouter } from "next/navigation";

import { GUEST_CREATE_CONTINUATION_URL, useGuestCreateContinuation } from "../../src/components/create-memory/GuestCreateContinuationProvider";
import { GuestLoginPanel } from "./GuestLoginPanel";
import { PublicProductNavigation } from "./PublicProductNavigation";
import styles from "./GuestPublicExperience.module.css";

type PublicPageVariant = "account" | "companion" | "create" | "memories";

function PublicFrame({ children, variant }: { children: ReactNode; variant: PublicPageVariant }) {
  const className = variant === "companion"
    ? `${styles.publicPage} ${styles.companionPage}`
    : `${styles.publicPage} ${styles.paperPage}`;

  return (
    <main className={className}>
      {children}
      <PublicProductNavigation overMedia={variant === "companion"} />
    </main>
  );
}

function SceneHeader({ marker, tone = "paper" }: { marker?: string; tone?: "light" | "paper" }) {
  return (
    <header className={`${styles.sceneHeader} ${tone === "light" ? styles.sceneHeaderLight : ""}`}>
      <strong>忆见</strong>
      {marker ? <span>{marker}</span> : <span aria-hidden="true" />}
    </header>
  );
}

export function GuestCompanionSurface() {
  const [message, setMessage] = useState("");
  const [loginOpen, setLoginOpen] = useState(false);

  return (
    <PublicFrame variant="companion">
      <section className={styles.companionStage} aria-label="AI 合成相伴示例">
        <video
          src="/home-hero-assets/elderly-woman.mp4"
          poster="/home-hero-assets/elderly-woman.poster.webp"
          autoPlay
          muted
          loop
          playsInline
          preload="metadata"
          aria-hidden="true"
        />
        <span className={styles.companionVeil} aria-hidden="true" />
        <SceneHeader marker="公开示例" tone="light" />
        <div className={styles.companionConversation}>
          <p className={styles.companionArrival}>你来了。</p>
          <p className={styles.companionQuestion}>今天想从哪件小事说起？</p>
        </div>
        <p className={styles.syntheticDisclosure}>AI 合成示例</p>
        <form className={styles.companionComposer} onSubmit={(event: FormEvent) => { event.preventDefault(); setLoginOpen(true); }}>
          <label className={styles.srOnly} htmlFor="guest-companion-message">写一句想说的话</label>
          <input id="guest-companion-message" value={message} onChange={(event) => setMessage(event.currentTarget.value)} placeholder="写一句想说的话" />
          <button type="submit">发送</button>
        </form>
      </section>
      {loginOpen && <GuestLoginPanel reason="登录后，继续和 TA 说话" onClose={() => setLoginOpen(false)} onAuthenticated={() => setLoginOpen(false)} />}
    </PublicFrame>
  );
}

const DEMO_MEMORIES = [
  { date: "春天", title: "窗边的一盆花", detail: "一张照片和一句话，留住当时的光。", image: "/guest-secondary-assets/memory-spring-approved.png" },
  { date: "夏天", title: "那条熟悉的路", detail: "把一个真实片段慢慢写下来。", image: "/guest-secondary-assets/memory-summer-approved.png" },
  { date: "今天", title: "想起的一件小事", detail: "每一次确认，都会成为可回看的记忆。", image: "/guest-secondary-assets/memory-today-approved.png" },
];

export function GuestMemorySurface() {
  const [loginOpen, setLoginOpen] = useState(false);

  return (
    <PublicFrame variant="memories">
      <section className={styles.memoriesHero}>
        <img src="/guest-secondary-assets/memories-hero-approved.png" alt="公开合成示例：窗边的老人和一盆花" loading="eager" fetchPriority="high" decoding="async" />
        <SceneHeader marker="公开示例" tone="light" />
      </section>
      <section className={styles.memoriesBody} aria-label="公开拾忆示例">
        <p className={styles.memoryDisclosure}>AI 合成示例</p>
        <ol className={styles.memoryTimeline}>
          {DEMO_MEMORIES.map((item) => (
            <li key={item.title}>
              <span className={styles.timelineStem} aria-hidden="true" />
              <img src={item.image} alt="" loading="lazy" fetchPriority="low" decoding="async" />
              <div>
                <time>{item.date}</time>
                <h2>{item.title}</h2>
                <p>{item.detail}</p>
              </div>
            </li>
          ))}
        </ol>
        <button className={styles.warmAction} type="button" onClick={() => setLoginOpen(true)}>添加一段回忆</button>
      </section>
      {loginOpen && <GuestLoginPanel reason="登录后，保存这段回忆" onClose={() => setLoginOpen(false)} onAuthenticated={() => setLoginOpen(false)} />}
    </PublicFrame>
  );
}

export function GuestAccountSurface() {
  const router = useRouter();
  const [loginOpen, setLoginOpen] = useState(false);

  return (
    <PublicFrame variant="account">
      <section className={styles.accountHero}>
        <img src="/guest-secondary-assets/account-album-approved.png" alt="窗边相册与信封" loading="eager" fetchPriority="high" decoding="async" />
        <SceneHeader tone="light" />
      </section>
      <section className={styles.accountBody}>
        <div className={styles.accountIntro}>
          <p>当前为游客</p>
          <h1>先看看，再决定是否开始。</h1>
          <button className={styles.accountLogin} type="button" onClick={() => setLoginOpen(true)}>登录</button>
        </div>
        <nav className={styles.accountLinks} aria-label="游客服务入口">
          <a href="/help">权益与服务说明</a><a href="/terms">用户协议</a><a href="/privacy">隐私政策</a><a href="/authorization">AI 生成内容说明</a><a href="/help">客服与反馈</a>
        </nav>
      </section>
      {loginOpen && <GuestLoginPanel reason="登录后，查看你的账户" onClose={() => setLoginOpen(false)} onAuthenticated={() => router.push("/continuity")} />}
    </PublicFrame>
  );
}

export function GuestCreateSurface() {
  const router = useRouter();
  const { continueGuestCreate } = useGuestCreateContinuation();
  const [name, setName] = useState("");
  const [relationship, setRelationship] = useState("");
  const [loginOpen, setLoginOpen] = useState(false);
  const [error, setError] = useState("");
  const continueToUpload = () => {
    if (!name.trim() || !relationship.trim()) return setError("先写下 TA 的称呼和你们的关系。");
    setError("");
    setLoginOpen(true);
  };

  return (
    <PublicFrame variant="create">
      <section className={styles.createHero}>
        <img src="/guest-secondary-assets/create-empty-frame-approved.png" alt="普通家庭环境中的空相框与空白纸条" loading="eager" fetchPriority="high" decoding="async" />
        <SceneHeader marker="第一步" tone="light" />
      </section>
      <section className={styles.createBody} aria-labelledby="guest-create-title">
        <h1 id="guest-create-title">先从一个称呼开始</h1>
        <label><span>怎么称呼 TA</span><input value={name} onChange={(event) => { setName(event.currentTarget.value); setError(""); }} placeholder="例如：爸爸" autoComplete="off" /></label>
        <label><span>你们的关系</span><input value={relationship} onChange={(event) => { setRelationship(event.currentTarget.value); setError(""); }} placeholder="例如：父亲" autoComplete="off" /></label>
        {error && <p className={styles.formError} role="status">{error}</p>}
        <button className={styles.warmAction} type="button" onClick={continueToUpload}>下一步：上传照片</button>
        <button className={styles.textAction} type="button" onClick={() => router.push("/")}>返回首页</button>
      </section>
      {loginOpen && <GuestLoginPanel reason="登录后，上传照片并继续创建" onClose={() => setLoginOpen(false)} onAuthenticated={() => { continueGuestCreate({ name: name.trim(), relationship: relationship.trim() }); router.push(GUEST_CREATE_CONTINUATION_URL); }} />}
    </PublicFrame>
  );
}
