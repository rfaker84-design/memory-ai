"use client";

import { ChangeEvent, type CSSProperties, useCallback, useEffect, useId, useRef, useState } from "react";

import { LOGIN_AGREEMENT_NOTICE, smsSendFailureNotice } from "../auth/loginExperienceClient";
import { useReducedMotion } from "../../motion";
import { assessPhotoFile, type PhotoQualityResult } from "./memorialPreviewQuality";
import styles from "./MemorialPreviewExperience.module.css";

type PreviewStage =
  | "phone"
  | "upload"
  | "checking"
  | "quality-blocked"
  | "forming"
  | "reveal"
  | "retention"
  | "opportunity"
  | "plans"
  | "library";

type VerificationStep = "phone" | "code";

type MemorialPreviewExperienceProps = {
  acceptanceMode?: boolean;
  onClose?: () => void;
};

const FORMING_DURATION_MS = 5200;
const REDUCED_FORMING_DURATION_MS = 900;
const PREVIEW_DURATION_MS = 10_000;

const FORMING_COPY = [
  ["正在读懂光线", "让熟悉的轮廓留在画面中央"],
  ["记忆正在聚拢", "星光会慢一点，让这一刻不被打扰"],
  ["画面即将亮起", "接下来是 10 秒动态效果演示"],
] as const;

function isChinaMobile(value: string) {
  const compact = value.trim().replace(/[\s()-]/g, "");
  const national = compact.startsWith("+86")
    ? compact.slice(3)
    : compact.startsWith("0086")
      ? compact.slice(4)
      : compact.startsWith("86") && compact.length === 13
        ? compact.slice(2)
        : compact;
  return /^1[3-9]\d{9}$/.test(national);
}

function QualityDetails({ result }: { result: PhotoQualityResult }) {
  if (!result.metrics) return null;

  const detail = `${result.metrics.width} × ${result.metrics.height} · 已检查光线与清晰度`;
  return <p className={styles.qualityMeta}>{detail}</p>;
}

export function MemorialPreviewExperience({
  acceptanceMode = false,
  onClose,
}: MemorialPreviewExperienceProps) {
  const reducedMotion = useReducedMotion();
  const [stage, setStage] = useState<PreviewStage>("phone");
  const [verificationStep, setVerificationStep] = useState<VerificationStep>("phone");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [agreementAccepted, setAgreementAccepted] = useState(false);
  const [challengeId, setChallengeId] = useState("");
  const [verificationNotice, setVerificationNotice] = useState("");
  const [sending, setSending] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [quality, setQuality] = useState<PhotoQualityResult | null>(null);
  const [formingStep, setFormingStep] = useState(0);
  const [previewRun, setPreviewRun] = useState(0);
  const [previewSeconds, setPreviewSeconds] = useState(10);
  const [offerNotice, setOfferNotice] = useState("");
  const [planNotice, setPlanNotice] = useState("");
  const localPhotoUrl = useRef<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const titleId = useId();

  const releasePhoto = useCallback(() => {
    if (localPhotoUrl.current) URL.revokeObjectURL(localPhotoUrl.current);
    localPhotoUrl.current = null;
  }, []);

  useEffect(() => () => releasePhoto(), [releasePhoto]);

  useEffect(() => {
    if (countdown <= 0) return;
    const timer = window.setInterval(() => setCountdown((current) => current - 1), 1000);
    return () => window.clearInterval(timer);
  }, [countdown]);

  const sendVerificationCode = async () => {
    if (sending) return;
    if (!agreementAccepted) {
      setVerificationNotice(LOGIN_AGREEMENT_NOTICE);
      return;
    }
    if (!isChinaMobile(phone)) {
      setVerificationNotice("请输入有效的中国大陆手机号。");
      return;
    }

    setSending(true);
    setVerificationNotice("");

    if (acceptanceMode) {
      window.setTimeout(() => {
        setChallengeId("acceptance-demo");
        setVerificationStep("code");
        setCountdown(60);
        setSending(false);
      }, 360);
      return;
    }

    try {
      const response = await fetch("/api/auth/send-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ phone }),
      });
      const payload = await response.json().catch(() => ({})) as {
        accepted?: boolean;
        challengeId?: string;
      };

      if (response.status === 202 && payload.accepted && payload.challengeId) {
        setChallengeId(payload.challengeId);
        setVerificationStep("code");
        setCountdown(60);
      } else {
        setVerificationNotice(smsSendFailureNotice(response.status));
      }
    } catch {
      setVerificationNotice("网络连接暂时中断，请检查网络后重试。");
    } finally {
      setSending(false);
    }
  };

  const verifyCode = async () => {
    if (verifying || code.length !== 6 || !challengeId) return;
    setVerifying(true);
    setVerificationNotice("");

    if (acceptanceMode) {
      window.setTimeout(() => {
        setVerifying(false);
        setStage("upload");
      }, 360);
      return;
    }

    try {
      const response = await fetch("/api/auth/verify-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ phone, code, challengeId }),
      });
      const payload = await response.json().catch(() => ({})) as { authenticated?: boolean };

      if (response.ok && payload.authenticated) {
        setStage("upload");
      } else {
        setVerificationNotice("验证码暂时无法确认，请重新获取后再试。");
      }
    } catch {
      setVerificationNotice("网络连接暂时中断，请检查网络后重试。");
    } finally {
      setVerifying(false);
    }
  };

  const startFormation = useCallback(() => {
    setFormingStep(0);
    setPreviewSeconds(10);
    setStage("forming");
  }, []);

  useEffect(() => {
    if (stage !== "forming") return;

    const duration = reducedMotion ? REDUCED_FORMING_DURATION_MS : FORMING_DURATION_MS;
    const stepTimers = reducedMotion
      ? []
      : [
          window.setTimeout(() => setFormingStep(1), Math.round(duration * 0.36)),
          window.setTimeout(() => setFormingStep(2), Math.round(duration * 0.72)),
        ];
    const revealTimer = window.setTimeout(() => {
      setPreviewRun((current) => current + 1);
      setStage("reveal");
    }, duration);

    return () => {
      stepTimers.forEach((timer) => window.clearTimeout(timer));
      window.clearTimeout(revealTimer);
    };
  }, [reducedMotion, stage]);

  useEffect(() => {
    if (stage !== "reveal") return;

    const startedAt = performance.now();
    const secondsTimer = window.setInterval(() => {
      const remaining = Math.max(0, PREVIEW_DURATION_MS - (performance.now() - startedAt));
      setPreviewSeconds(Math.ceil(remaining / 1000));
    }, 200);
    const finishTimer = window.setTimeout(() => {
      setPreviewSeconds(0);
      setStage("retention");
    }, PREVIEW_DURATION_MS);

    return () => {
      window.clearInterval(secondsTimer);
      window.clearTimeout(finishTimer);
    };
  }, [previewRun, stage]);

  const choosePhoto = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0] ?? null;
    event.currentTarget.value = "";
    if (!file) return;

    releasePhoto();
    setPhotoUrl(null);
    setQuality(null);
    setStage("checking");

    const result = await assessPhotoFile(file);
    setQuality(result);

    if (!result.accepted) {
      setStage("quality-blocked");
      return;
    }

    const url = URL.createObjectURL(file);
    localPhotoUrl.current = url;
    setPhotoUrl(url);
    window.setTimeout(startFormation, reducedMotion ? 160 : 620);
  };

  const continueGenerating = () => {
    setFormingStep(0);
    setPreviewSeconds(10);
    setOfferNotice("");
    setPlanNotice("");
    setStage("forming");
  };

  const resetExperience = () => {
    releasePhoto();
    setStage("phone");
    setVerificationStep("phone");
    setPhone("");
    setCode("");
    setAgreementAccepted(false);
    setChallengeId("");
    setVerificationNotice("");
    setPhotoUrl(null);
    setQuality(null);
    setPreviewRun(0);
    setPreviewSeconds(10);
    setOfferNotice("");
    setPlanNotice("");
  };

  const closeExperience = () => {
    if (onClose) onClose();
    else resetExperience();
  };

  const returnToPhone = () => {
    setVerificationStep("phone");
    setCode("");
    setChallengeId("");
    setCountdown(0);
    setVerificationNotice("");
  };

  const headerNote = stage === "phone"
    ? "先验证，再生成"
    : acceptanceMode
      ? "非生产验收"
      : "手机号已验证";

  const cinematicStage = stage === "reveal"
    || stage === "retention"
    || stage === "opportunity"
    || stage === "plans";

  return (
    <main
      className={`${styles.experience} ${reducedMotion ? styles.reduced : ""}`}
      data-stage={stage}
      aria-labelledby={titleId}
    >
      <div className={styles.stars} aria-hidden="true" />
      <div className={styles.nebula} aria-hidden="true" />

      {stage !== "library" && !cinematicStage && (
        <header className={styles.header}>
          <button type="button" className={styles.wordmark} onClick={closeExperience}>忆见</button>
          <span className={styles.headerLine} aria-hidden="true" />
          <p className={styles.zeroWriteLabel}>{headerNote}</p>
        </header>
      )}

      {stage === "phone" && (
        <section className={styles.verifyScene}>
          <div className={styles.verifyHalo} aria-hidden="true" />
          <div className={styles.verifyCopy}>
            <p className={styles.eyebrow}>个人免费体验</p>
            <h1 id={titleId}>
              {verificationStep === "phone" ? "先确认是你，再开始这一段影像。" : "把收到的数字，轻轻填在这里。"}
            </h1>
            <p className={styles.lead}>
              {verificationStep === "phone"
                ? "手机号验证完成后，才会进入照片上传和个人免费动态预览。"
                : `验证码已发送至 ${phone}。验证完成后直接选择照片，之后只专注于这段影像。`}
            </p>
          </div>

          <div className={styles.verifyForm}>
            {verificationNotice && <p role="alert" className={styles.verifyNotice}>{verificationNotice}</p>}

            {verificationStep === "phone" ? (
              <>
                <label htmlFor={`${titleId}-phone`}>手机号</label>
                <input
                  id={`${titleId}-phone`}
                  type="tel"
                  value={phone}
                  onChange={(event) => {
                    setPhone(event.currentTarget.value.replace(/[^\d+()\s-]/g, "").slice(0, 16));
                    setVerificationNotice("");
                  }}
                  placeholder="输入中国大陆手机号"
                  inputMode="tel"
                  autoComplete="tel"
                  maxLength={16}
                />
                <button
                  type="button"
                  className={styles.primaryAction}
                  disabled={sending}
                  onClick={() => void sendVerificationCode()}
                >
                  {sending ? "正在确认…" : "获取验证码"}
                </button>
                <div className={styles.agreementRow}>
                  <input
                    id={`${titleId}-agreement`}
                    type="checkbox"
                    checked={agreementAccepted}
                    onChange={(event) => {
                      setAgreementAccepted(event.currentTarget.checked);
                      if (event.currentTarget.checked && verificationNotice === LOGIN_AGREEMENT_NOTICE) {
                        setVerificationNotice("");
                      }
                    }}
                  />
                  <label htmlFor={`${titleId}-agreement`}>
                    我已阅读并同意
                    <a href="/terms">《用户协议》</a>
                    和
                    <a href="/privacy">《隐私政策》</a>
                  </label>
                </div>
              </>
            ) : (
              <>
                <label htmlFor={`${titleId}-code`}>验证码</label>
                <input
                  id={`${titleId}-code`}
                  type="text"
                  value={code}
                  onChange={(event) => {
                    setCode(event.currentTarget.value.replace(/\D/g, "").slice(0, 6));
                    setVerificationNotice("");
                  }}
                  placeholder="输入 6 位验证码"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  className={styles.codeInput}
                />
                <button
                  type="button"
                  className={styles.primaryAction}
                  disabled={code.length !== 6 || verifying}
                  onClick={() => void verifyCode()}
                >
                  {verifying ? "正在验证…" : "验证并继续"}
                </button>
                <button type="button" className={styles.textAction} onClick={returnToPhone}>
                  {countdown > 0 ? `更换手机号 · ${countdown}s` : "更换手机号"}
                </button>
              </>
            )}

            <p className={styles.verifyMeta}>
              {acceptanceMode
                ? "验收演示不会发送真实短信；输入任意 6 位数字即可继续。"
                : "未注册手机号验证后会创建忆见账号，用于承接这次个人免费体验。"}
            </p>
          </div>
        </section>
      )}

      {(stage === "upload" || stage === "checking" || stage === "quality-blocked") && (
        <section className={styles.uploadScene}>
          <div className={styles.uploadHalo} aria-hidden="true" />
          <div className={styles.uploadCopy}>
            <p className={styles.eyebrow}>
              {stage === "quality-blocked" ? "换一张也没关系" : stage === "checking" ? "正在温柔地看一看" : "从一张照片开始"}
            </p>
            <h1 id={titleId}>
              {stage === "quality-blocked"
                ? quality?.title
                : stage === "checking"
                  ? "先看看这张照片是否合适。"
                  : "选择一张你最熟悉的照片。"}
            </h1>
            <p className={styles.lead}>
              {stage === "quality-blocked"
                ? quality?.guidance
                : stage === "checking"
                  ? "我们只判断画面是否清楚，不会先展示照片，也不会把它保存下来。"
                  : "尽量选择清晰、光线自然、以 TA 为中心的照片。判断通过后，直接进入动态效果演示。"}
            </p>
            {stage === "quality-blocked" && quality && <QualityDetails result={quality} />}
            {stage === "checking" ? (
              <div className={styles.checkingLine} role="status" aria-live="polite"><span />正在判断照片质量</div>
            ) : (
              <button type="button" className={styles.primaryAction} onClick={() => fileInputRef.current?.click()}>
                {stage === "quality-blocked" ? "换一张照片" : "选择照片"}
              </button>
            )}
            <input
              ref={fileInputRef}
              className={styles.fileInput}
              aria-label="上传 TA 的照片"
              type="file"
              accept="image/*"
              onChange={(event) => void choosePhoto(event)}
            />
            <p className={styles.privacyNote}>
              JPG、PNG、HEIC 或 WebP，20MB 以内。照片只在当前设备完成本次演示。
            </p>
          </div>
          <aside className={styles.photoGuide} aria-label="照片建议">
            <span>01</span>
            <p>让 TA 在画面中央</p>
            <span>02</span>
            <p>尽量选择清晰正脸</p>
            <span>03</span>
            <p>避开强烈逆光或遮挡</p>
          </aside>
        </section>
      )}

      {stage === "forming" && (
        <section className={styles.formingScene} role="status" aria-live="polite">
          <div className={styles.orbit} aria-hidden="true"><i /><i /><i /></div>
          <div className={styles.formingFrame} aria-hidden="true">
            <span className={styles.formingLight} />
            <span className={styles.formingDust} />
          </div>
          <div className={styles.formingCopy} key={formingStep}>
            <p className={styles.eyebrow}>动态效果演示</p>
            <h1 id={titleId}>{FORMING_COPY[formingStep][0]}</h1>
            <p>{FORMING_COPY[formingStep][1]}</p>
          </div>
          <div className={styles.formingProgress} aria-hidden="true">
            <span style={{ "--forming-step": formingStep } as CSSProperties} />
          </div>
          <p className={styles.formatNote}>演示画面 · 非真实 AI 生成视频</p>
        </section>
      )}

      {cinematicStage && photoUrl && (
        <section className={styles.revealScene}>
          <div className={styles.cinemaBackdrop} style={{ backgroundImage: `url("${photoUrl}")` }} aria-hidden="true" />
          <div
            key={previewRun}
            className={`${styles.cinemaFrame} ${previewRun % 2 === 0 ? styles.takeOne : styles.takeTwo} ${stage !== "reveal" ? styles.previewComplete : ""}`}
            aria-label="TA 的十秒静音动态效果演示，非真实 AI 生成视频"
          >
            <div className={styles.cinemaImage} style={{ backgroundImage: `url("${photoUrl}")` }} />
            <div className={styles.cinemaLight} aria-hidden="true" />
            <div className={styles.cinemaVignette} aria-hidden="true" />
            <div className={styles.demoBadge}>
              <strong>动态效果演示</strong>
              <span>非真实 AI 生成视频</span>
            </div>
            {stage === "reveal" && (
              <>
                <p className={styles.firstPresence}>熟悉的样子，慢慢浮现在眼前</p>
                <div className={styles.previewClock}>
                  <b>00:{String(previewSeconds).padStart(2, "0")}</b>
                </div>
                <div className={styles.previewTimeline} aria-label="十秒演示播放进度"><span /></div>
              </>
            )}
          </div>

          {stage === "retention" && (
            <div className={`${styles.choicePanel} ${styles.retentionPanel}`}>
              <p className={styles.eyebrow}>刚刚的 10 秒</p>
              <h1 id={titleId}>想把这段影像留在身边吗？</h1>
              <p>这是付费前的动态效果演示，还没有保存，也没有产生费用。</p>
              <button type="button" className={styles.primaryAction} onClick={() => setStage("opportunity")}>
                留住这段影像
              </button>
            </div>
          )}

          {stage === "opportunity" && (
            <div className={`${styles.choicePanel} ${styles.offerPanel}`}>
              <p className={styles.eyebrow}>选择一种留下的方式</p>
              <h1 id={titleId}>让下一次出现，有一个温柔的理由。</h1>
              <div className={styles.offerGrid}>
                <button
                  type="button"
                  className={styles.offerOption}
                  onClick={() => setOfferNotice("演示中不会真正分享；正式分享完成后，体验机会才会发放。")}
                >
                  <span>分享获得体验机会</span>
                  <small>分享纪念体验，确认完成后获得 1 次新的动态预览机会。</small>
                </button>
                <button type="button" className={styles.offerOption} onClick={() => setStage("plans")}>
                  <span>查看购买方案</span>
                  <small>不绕路，直接了解如何长期留住这一段影像。</small>
                </button>
              </div>
              {offerNotice && <p role="status" className={styles.offerNotice}>{offerNotice}</p>}
              <button type="button" className={styles.textAction} onClick={() => setStage("library")}>
                先看未保存的影像
              </button>
            </div>
          )}

          {stage === "plans" && (
            <div className={`${styles.saveSheet} ${styles.planSheet}`} role="dialog" aria-modal="true" aria-labelledby={`${titleId}-plans`}>
              <span className={styles.sheetHandle} aria-hidden="true" />
              <p className={styles.eyebrow}>购买方案</p>
              <h1 id={`${titleId}-plans`}>按你想留下的方式来选。</h1>
              <div className={styles.planList}>
                <button type="button" onClick={() => setPlanNotice("已选择“留住这一段”。验收演示不会创建订单或发起付款。")}>
                  <span>留住这一段</span>
                  <small>适合只想保存当前影像的人</small>
                </button>
                <button type="button" onClick={() => setPlanNotice("已选择“纪念影像小集”。验收演示不会创建订单或发起付款。")}>
                  <span>纪念影像小集</span>
                  <small>适合继续生成并慢慢整理的人</small>
                </button>
              </div>
              <p className={styles.planLimit}>价格、权益与支付继续沿用现有系统；本次验收不创建订单，也不发起付款。</p>
              {planNotice && <p role="status" className={styles.offerNotice}>{planNotice}</p>}
              <div className={styles.choiceActions}>
                <button type="button" className={styles.quietAction} onClick={() => setStage("opportunity")}>返回选择</button>
                <button type="button" className={styles.primaryAction} onClick={() => setStage("library")}>先看影像</button>
              </div>
            </div>
          )}
        </section>
      )}

      {stage === "library" && photoUrl && (
        <section className={styles.libraryScene}>
          <header className={styles.libraryHeader}>
            <button type="button" className={styles.wordmark} onClick={closeExperience}>忆见</button>
            <button type="button" className={styles.libraryClose} onClick={closeExperience}>回到首页</button>
          </header>
          <div className={styles.libraryIntro}>
            <p className={styles.eyebrow}>影像库</p>
            <h1 id={titleId}>想留下的影像，会在这里慢慢聚成星光。</h1>
            <p>当前只有这一段动态效果演示。它还没有保存，也不会自动占用体验机会或额度。</p>
          </div>
          <div className={styles.libraryGrid}>
            <article className={styles.libraryItem}>
              <div className={styles.libraryPortrait} style={{ backgroundImage: `url("${photoUrl}")` }}>
                <span>动态效果演示</span>
              </div>
              <div className={styles.libraryItemMeta}>
                <div><strong>刚刚的 10 秒</strong><p>演示预览</p></div>
                <span>未保存</span>
              </div>
            </article>
          </div>
          <div className={styles.libraryFooter}>
            <p>分享机会、购买方案与保存状态都要在真实流程确认后才会生效。</p>
            <div className={styles.libraryActions}>
              <button type="button" className={styles.quietAction} onClick={() => setStage("opportunity")}>查看留存方式</button>
              <button type="button" className={styles.textAction} onClick={continueGenerating}>再看一次演示</button>
            </div>
          </div>
        </section>
      )}
    </main>
  );
}
