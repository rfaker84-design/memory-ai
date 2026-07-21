"use client";

import { ChangeEvent, FormEvent, useEffect, useId, useState } from "react";

import { MemoryAvatar, MemoryButton, MemoryInput, MemorySurface } from "../memory-ui";
import { MemoryMotion, MemoryRadius, MemorySpacing, MemorySurface as SurfaceToken, MemoryTypography, MemoryZIndex } from "../../design";
import { useReducedMotion } from "../../motion";

import styles from "./FirstPresenceFlow.module.css";

type FlowStage = "home" | "login" | "create" | "generating" | "greeting" | "failed";

const greeting = "我在。我们可以先从你想说的那一件小事开始。";

export function FirstPresenceFlow() {
  const reducedMotion = useReducedMotion();
  const [stage, setStage] = useState<FlowStage>("home");
  const [name, setName] = useState("");
  const [relationship, setRelationship] = useState("");
  const [phone, setPhone] = useState("");
  const [error, setError] = useState("");
  const titleId = useId();

  useEffect(() => {
    if (stage !== "generating") return;
    const timer = window.setTimeout(() => setStage("greeting"), reducedMotion ? 150 : 2200);
    return () => window.clearTimeout(timer);
  }, [reducedMotion, stage]);

  const beginLogin = () => {
    setError("");
    setStage("login");
  };

  const handleLogin = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (phone.trim().length < 6) {
      setError("请输入可用的手机号或邮箱后继续。");
      return;
    }
    setError("");
    setStage("create");
  };

  const createPresence = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!name.trim() || !relationship.trim()) {
      setError("先告诉我们 TA 的名字，以及 TA 和你的关系。");
      return;
    }
    setError("");
    setStage("generating");
  };

  const retryGeneration = () => {
    setError("");
    setStage("generating");
  };

  const showFailure = () => {
    setError("形象暂时没有准备好。你的输入仍保留在这一页，可以稍后再试。");
    setStage("failed");
  };

  const displayName = name.trim() || "TA";
  const stageLabel: Record<FlowStage, string> = {
    home: "首访首页",
    login: "登录入口",
    create: "创建亲人",
    generating: "正在生成",
    greeting: "第一次问候",
    failed: "加载失败",
  };

  return (
    <MemorySurface
      variant="background"
      className={styles.scene}
      style={{ "--motion-duration": `${reducedMotion ? 0 : MemoryMotion.duration.enter}ms` } as React.CSSProperties}
    >
      <div className={styles.frame}>
        <header className={styles.header}>
          <button className={styles.wordmark} type="button" onClick={() => setStage("home")} aria-label="回到忆见首页">
            忆见 <span>memoryai</span>
          </button>
          <span className={styles.step} aria-live="polite">{stageLabel[stage]}</span>
        </header>

        <main className={styles.main} aria-labelledby={titleId}>
          <section className={`${styles.presenceStage} ${stage === "greeting" ? styles.present : ""}`} aria-label="亲人形象">
            <div className={styles.lightColumn} aria-hidden="true" />
            <div className={styles.ringOne} aria-hidden="true" />
            <div className={styles.ringTwo} aria-hidden="true" />
            <div className={styles.figureWrap}>
              <div className={styles.figureAura} aria-hidden="true" />
              <MemoryAvatar initials={displayName} presence={stage === "greeting" ? "online" : "quiet"} size={136} />
              <span className={styles.presenceName}>{stage === "home" || stage === "login" ? "一个熟悉的人，会慢慢来到这里" : displayName}</span>
            </div>
          </section>

          <section className={styles.controlShell} aria-describedby="flow-description">
            {stage === "home" && (
              <div className={styles.copyBlock}>
                <p className={styles.kicker}>不是档案，也不是一次性表单</p>
                <h1 id={titleId}>让想念的人，<br />先被好好看见。</h1>
                <p id="flow-description">从一个名字、一段关系开始。人物会先出现，其余的事，我们慢慢做。</p>
                <div className={styles.actions}>
                  <MemoryButton variant="primary" onClick={beginLogin}>开始遇见</MemoryButton>
                  <button className={styles.textButton} type="button" onClick={() => setStage("create")}>先看看创建方式</button>
                </div>
              </div>
            )}

            {stage === "login" && (
              <form className={styles.copyBlock} onSubmit={handleLogin} noValidate>
                <p className={styles.kicker}>轻轻登录</p>
                <h1 id={titleId}>先确认，是你。</h1>
                <p id="flow-description">登录只为把这段相遇留在你的手里，不会打断此刻的场景。</p>
                <MemoryInput label="手机号或邮箱" value={phone} onChange={(event: ChangeEvent<HTMLInputElement>) => setPhone(event.currentTarget.value)} autoComplete="username" autoFocus error={error || undefined} />
                <div className={styles.actions}>
                  <MemoryButton type="submit">继续</MemoryButton>
                  <button className={styles.textButton} type="button" onClick={() => setStage("home")}>返回</button>
                </div>
              </form>
            )}

            {stage === "create" && (
              <form className={styles.copyBlock} onSubmit={createPresence} noValidate>
                <p className={styles.kicker}>第一笔，不必写满</p>
                <h1 id={titleId}>TA 是谁？</h1>
                <p id="flow-description">先留下一点真实。之后每次相处，都可以慢慢补全。</p>
                <div className={styles.fieldGrid}>
                  <MemoryInput label="TA 的名字" value={name} onChange={(event: ChangeEvent<HTMLInputElement>) => setName(event.currentTarget.value)} autoFocus error={error || undefined} />
                  <MemoryInput label="与你的关系" value={relationship} onChange={(event: ChangeEvent<HTMLInputElement>) => setRelationship(event.currentTarget.value)} />
                </div>
                <div className={styles.actions}>
                  <MemoryButton type="submit">让 TA 出现</MemoryButton>
                  <button className={styles.textButton} type="button" onClick={() => setStage("login")}>上一步</button>
                </div>
              </form>
            )}

            {stage === "generating" && (
              <div className={styles.copyBlock} role="status" aria-live="polite">
                <p className={styles.kicker}>正在靠近</p>
                <h1 id={titleId}>{displayName} 正在出现。</h1>
                <p id="flow-description">先让轮廓变得清楚，再把第一句话交给你。</p>
                <div className={styles.progressLine} aria-hidden="true"><span /></div>
                <button className={styles.textButton} type="button" onClick={showFailure}>模拟加载失败</button>
              </div>
            )}

            {stage === "greeting" && (
              <div className={styles.copyBlock}>
                <p className={styles.kicker}>第一次问候</p>
                <h1 id={titleId}>你好，{displayName}。</h1>
                <p className={styles.greeting} id="flow-description">“{greeting}”</p>
                <div className={styles.actions}>
                  <MemoryButton variant="primary" onClick={() => setStage("create")}>补充一段记忆</MemoryButton>
                  <button className={styles.textButton} type="button" onClick={() => setStage("home")}>回到首页</button>
                </div>
              </div>
            )}

            {stage === "failed" && (
              <div className={styles.copyBlock} role="alert">
                <p className={styles.kicker}>还差一点</p>
                <h1 id={titleId}>这次没有顺利出现。</h1>
                <p id="flow-description">{error}</p>
                <div className={styles.actions}>
                  <MemoryButton variant="primary" onClick={retryGeneration}>再试一次</MemoryButton>
                  <button className={styles.textButton} type="button" onClick={() => setStage("create")}>回到输入</button>
                </div>
              </div>
            )}
          </section>
        </main>

        <footer className={styles.footer}>
          <span>你的节奏，由你决定。</span>
          <span>支持键盘操作与减少动态效果</span>
        </footer>
      </div>
    </MemorySurface>
  );
}
