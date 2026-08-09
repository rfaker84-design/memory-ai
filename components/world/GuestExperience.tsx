"use client";

import { useEffect, useState } from "react";

import { useReducedMotion } from "../../src/motion";
import styles from "./GuestExperience.module.css";

type GuestStage = "entry" | "awakening" | "companion";

const DISCLOSURE = "AI生成示例 · 使用虚构示例资料 · 不代表真实人物或其真实表达 · 不会上传或保存，也不会创建账号或 TA";

export function GuestExperience({ onLogin }: { onLogin: () => void }) {
  const reducedMotion = useReducedMotion();
  const [stage, setStage] = useState<GuestStage>("entry");

  useEffect(() => {
    if (stage !== "awakening") return;
    const timer = window.setTimeout(
      () => setStage("companion"),
      reducedMotion ? 120 : 2_200,
    );
    return () => window.clearTimeout(timer);
  }, [reducedMotion, stage]);

  return (
    <main className={styles.experience} data-stage={stage} data-reduced-motion={reducedMotion ? "true" : "false"}>
      <div className={styles.stars} aria-hidden="true" />
      <div className={styles.ambientLight} aria-hidden="true" />

      <header className={styles.header}>
        <span className={styles.wordmark}>忆见</span>
        <span className={styles.mode}>公开体验</span>
      </header>

      <p className={styles.disclosure} role="note">{DISCLOSURE}</p>

      {stage === "entry" && (
        <section className={styles.entry} aria-labelledby="guest-entry-title">
          <div className={styles.samplePresence} aria-hidden="true">
            <span className={styles.presenceHalo} />
            <span className={styles.sampleInitials}>TA</span>
            <i /><i /><i />
          </div>
          <p className={styles.eyebrow}>不登录，也可以先感受忆见</p>
          <h1 id="guest-entry-title">有些想念，<br />可以先被温柔地放在这里。</h1>
          <p className={styles.lead}>看看一段虚构示例，感受从记忆被唤醒，到进入安静陪伴空间的过程。</p>
          <div className={styles.actions}>
            <button className={styles.primaryAction} type="button" onClick={() => setStage("awakening")}>进入示例体验</button>
            <button className={styles.secondaryAction} type="button" onClick={onLogin}>登录 / 创建我的 TA</button>
          </div>
        </section>
      )}

      {stage === "awakening" && (
        <section className={styles.awakening} role="status" aria-live="polite" aria-labelledby="guest-awakening-title">
          <div className={styles.awakeningPortrait} role="img" aria-label="虚构示例 TA 的抽象轮廓">
            <span>TA</span>
            <i /><i /><i /><i />
          </div>
          <p className={styles.eyebrow}>视觉效果示例 · 未生成真实视频</p>
          <h1 id="guest-awakening-title">正在唤醒一段示例记忆…</h1>
          <div className={styles.awakeningCopy} aria-hidden="true">
            <span>正在整理虚构示例资料…</span>
            <span>正在让熟悉的轮廓慢慢出现…</span>
          </div>
        </section>
      )}

      {stage === "companion" && (
        <section className={styles.companion} aria-labelledby="guest-companion-title">
          <p className={styles.eyebrow}>陪伴空间示例</p>
          <div className={styles.companionPortrait} role="img" aria-label="虚构示例 TA 的抽象轮廓"><span>TA</span></div>
          <h1 id="guest-companion-title">示例 TA，已经在这里。</h1>
          <p className={styles.relationship}>亲人关系 · 虚构示例</p>
          <div className={styles.dailyGreeting}>
            <span>今天的一句示例问候</span>
            <blockquote>“今天过得怎么样？如果愿意，就从一件小事说起。”</blockquote>
            <small>预设 AI 示例文案 · 未调用 AI 服务 · 不是任何真实人物的留言</small>
          </div>
          <p className={styles.companionCopy}>正式使用时，陪伴空间只会读取你登录后拥有并确认的 TA 资料。</p>
          <div className={styles.actions}>
            <button className={styles.primaryAction} type="button" onClick={onLogin}>登录后创建我的 TA</button>
            <button className={styles.secondaryAction} type="button" onClick={() => setStage("entry")}>重新体验</button>
          </div>
        </section>
      )}
    </main>
  );
}
