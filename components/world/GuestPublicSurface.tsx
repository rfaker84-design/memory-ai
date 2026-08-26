"use client";

import { FormEvent, ReactNode, useState } from "react";
import { useRouter } from "next/navigation";

import { GUEST_CREATE_CONTINUATION_URL, useGuestCreateContinuation } from "../../src/components/create-memory/GuestCreateContinuationProvider";
import { GuestLoginPanel } from "./GuestLoginPanel";
import { PublicProductNavigation, PublicProductTab } from "./PublicProductNavigation";
import styles from "./GuestPublicExperience.module.css";

function PublicFrame({ active, children }: { active: PublicProductTab; children: ReactNode }) {
  return <main className={styles.publicPage}><header className={styles.publicHeader}><span>忆见</span><small>公开示例</small></header><div className={styles.publicContent}>{children}</div><PublicProductNavigation active={active} /></main>;
}

export function GuestCompanionSurface() {
  const [message, setMessage] = useState("");
  const [loginOpen, setLoginOpen] = useState(false);
  return <PublicFrame active="companion">
    <section className={styles.companionStage} aria-label="AI 合成相伴示例">
      <video src="/home-hero-assets/elderly-woman.mp4" poster="/home-hero-assets/elderly-woman.poster.webp" autoPlay muted loop playsInline preload="metadata" />
      <span>AI 合成示例</span>
    </section>
    <section className={styles.chatDemo} aria-label="公开聊天示例">
      <p>今天想从哪一件小事说起？</p>
      <form onSubmit={(event: FormEvent) => { event.preventDefault(); setLoginOpen(true); }}>
        <input value={message} onChange={(event) => setMessage(event.currentTarget.value)} placeholder="写一句想说的话" aria-label="写一句想说的话" />
        <button type="submit">发送</button>
      </form>
    </section>
    {loginOpen && <GuestLoginPanel reason="登录后，继续和 TA 说话" onClose={() => setLoginOpen(false)} onAuthenticated={() => setLoginOpen(false)} />}
  </PublicFrame>;
}

const DEMO_MEMORIES = [
  { date: "春天", title: "窗边的一盆花", detail: "一张照片和一句话，留住当时的光。" },
  { date: "夏天", title: "那条熟悉的路", detail: "把一个真实片段慢慢写下来。" },
  { date: "今天", title: "想起的一件小事", detail: "每一次确认，都会成为可回看的记忆。" },
];

export function GuestMemorySurface() {
  const [loginOpen, setLoginOpen] = useState(false);
  return <PublicFrame active="memory">
    <section className={styles.memoryList} aria-label="公开拾忆示例">
      <p className={styles.eyebrow}>AI 合成示例</p>
      {DEMO_MEMORIES.map((item) => <article key={item.title}><time>{item.date}</time><div><h1>{item.title}</h1><p>{item.detail}</p></div></article>)}
    </section>
    <button className={styles.warmAction} type="button" onClick={() => setLoginOpen(true)}>添加一段回忆</button>
    {loginOpen && <GuestLoginPanel reason="登录后，保存这段回忆" onClose={() => setLoginOpen(false)} onAuthenticated={() => setLoginOpen(false)} />}
  </PublicFrame>;
}

export function GuestAccountSurface() {
  const router = useRouter();
  const [loginOpen, setLoginOpen] = useState(false);
  return <PublicFrame active="account">
    <section className={styles.accountIntro}><p>当前为游客</p><h1>先看看，再决定是否开始。</h1><button className={styles.warmAction} type="button" onClick={() => setLoginOpen(true)}>登录</button></section>
    <nav className={styles.accountLinks} aria-label="游客服务入口">
      <a href="/help">权益与服务说明</a><a href="/terms">用户协议</a><a href="/privacy">隐私政策</a><a href="/authorization">AI 生成内容说明</a><a href="/help">客服与反馈</a>
    </nav>
    {loginOpen && <GuestLoginPanel reason="登录后，查看你的账户" onClose={() => setLoginOpen(false)} onAuthenticated={() => router.push("/continuity")} />}
  </PublicFrame>;
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
  return <PublicFrame active="home">
    <section className={styles.createStep} aria-labelledby="guest-create-title">
      <p className={styles.eyebrow}>创建 TA · 第一步</p><h1 id="guest-create-title">先从一个称呼开始</h1>
      <label><span>怎么称呼 TA</span><input value={name} onChange={(event) => { setName(event.currentTarget.value); setError(""); }} placeholder="例如：爸爸" autoComplete="off" /></label>
      <label><span>你们的关系</span><input value={relationship} onChange={(event) => { setRelationship(event.currentTarget.value); setError(""); }} placeholder="例如：父亲" autoComplete="off" /></label>
      {error && <p className={styles.formError} role="status">{error}</p>}
      <button className={styles.warmAction} type="button" onClick={continueToUpload}>下一步：上传照片</button>
      <button className={styles.textAction} type="button" onClick={() => router.push("/")}>返回首页</button>
    </section>
    {loginOpen && <GuestLoginPanel reason="登录后，上传照片并继续创建" onClose={() => setLoginOpen(false)} onAuthenticated={() => { continueGuestCreate({ name: name.trim(), relationship: relationship.trim() }); router.push(GUEST_CREATE_CONTINUATION_URL); }} />}
  </PublicFrame>;
}
