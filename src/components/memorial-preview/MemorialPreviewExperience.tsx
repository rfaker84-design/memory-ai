"use client";

import { ChangeEvent, useCallback, useEffect, useId, useRef, useState } from "react";

import { useReducedMotion } from "../../motion";
import { assessPhotoFile, type PhotoQualityResult } from "./memorialPreviewQuality";
import styles from "./MemorialPreviewExperience.module.css";

type PreviewStage =
  | "upload"
  | "checking"
  | "quality-blocked"
  | "forming"
  | "reveal"
  | "choice"
  | "save-prompt"
  | "library";

type MemorialPreviewExperienceProps = {
  acceptanceMode?: boolean;
  onClose?: () => void;
  onRequestAccount?: () => void;
};

const FORMING_DURATION_MS = 5200;
const REDUCED_FORMING_DURATION_MS = 900;
const PREVIEW_DURATION_MS = 10_000;

const FORMING_COPY = [
  ["正在读懂光线", "让熟悉的轮廓留在画面中央"],
  ["记忆正在聚拢", "星光会慢一点，让出现不被打扰"],
  ["影像即将出现", "这段预览没有声音，也不会让 TA 开口"],
] as const;

function stageIndex(stage: PreviewStage) {
  if (stage === "upload") return 0;
  if (stage === "checking" || stage === "quality-blocked") return 1;
  if (stage === "forming") return 2;
  if (stage === "reveal" || stage === "choice" || stage === "save-prompt") return 3;
  return 4;
}

function QualityDetails({ result }: { result: PhotoQualityResult }) {
  if (!result.metrics) return null;

  const detail = `${result.metrics.width} × ${result.metrics.height} · 光线与清晰度已检查`;
  return <p className={styles.qualityMeta}>{detail}</p>;
}

export function MemorialPreviewExperience({
  acceptanceMode = false,
  onClose,
  onRequestAccount,
}: MemorialPreviewExperienceProps) {
  const reducedMotion = useReducedMotion();
  const [stage, setStage] = useState<PreviewStage>("upload");
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [quality, setQuality] = useState<PhotoQualityResult | null>(null);
  const [formingStep, setFormingStep] = useState(0);
  const [previewRun, setPreviewRun] = useState(0);
  const [previewSeconds, setPreviewSeconds] = useState(10);
  const localPhotoUrl = useRef<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const titleId = useId();
  const activeStep = stageIndex(stage);

  const releasePhoto = useCallback(() => {
    if (localPhotoUrl.current) URL.revokeObjectURL(localPhotoUrl.current);
    localPhotoUrl.current = null;
  }, []);

  useEffect(() => () => releasePhoto(), [releasePhoto]);

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
      setStage("choice");
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

  const chooseAnotherPhoto = () => {
    setQuality(null);
    setStage("upload");
    window.setTimeout(() => fileInputRef.current?.click(), 0);
  };

  const continueGenerating = () => {
    setStage("forming");
    setFormingStep(0);
    setPreviewSeconds(10);
  };

  const resetExperience = () => {
    releasePhoto();
    setPhotoUrl(null);
    setQuality(null);
    setPreviewRun(0);
    setPreviewSeconds(10);
    setStage("upload");
  };

  const closeExperience = () => {
    if (onClose) onClose();
    else resetExperience();
  };

  return (
    <main
      className={`${styles.experience} ${reducedMotion ? styles.reduced : ""}`}
      data-stage={stage}
      aria-labelledby={titleId}
    >
      <div className={styles.stars} aria-hidden="true" />
      <div className={styles.nebula} aria-hidden="true" />

      {stage !== "library" && (
        <header className={styles.header}>
          <button type="button" className={styles.wordmark} onClick={closeExperience}>忆见</button>
          <div className={styles.progress} aria-label={`首发体验第 ${activeStep + 1} 步，共 5 步`}>
            {["照片", "判断", "生成", "出现", "影像"].map((label, index) => (
              <span key={label} className={index === activeStep ? styles.currentStep : index < activeStep ? styles.doneStep : ""}>
                <i aria-hidden="true" />
                <b>{label}</b>
              </span>
            ))}
          </div>
          <p className={styles.zeroWriteLabel}>{acceptanceMode ? "非生产验收" : "免费预览"} · 不保存</p>
        </header>
      )}

      {(stage === "upload" || stage === "checking" || stage === "quality-blocked") && (
        <section className={styles.uploadScene}>
          <div className={styles.uploadHalo} aria-hidden="true" />
          <div className={styles.uploadCopy}>
            <p className={styles.eyebrow}>
              {stage === "quality-blocked" ? "换一张也没关系" : stage === "checking" ? "正在温柔地看一看" : "第一次出现"}
            </p>
            <h1 id={titleId}>
              {stage === "quality-blocked"
                ? quality?.title
                : stage === "checking"
                  ? "先看看这张照片是否合适。"
                  : "从一张你最熟悉的照片开始。"}
            </h1>
            <p className={styles.lead}>
              {stage === "quality-blocked"
                ? quality?.guidance
                : stage === "checking"
                  ? "我们只判断画面是否清楚，不会先展示照片，也不会把它保存下来。"
                  : "选择清晰、光线自然、以 TA 为中心的照片。通过质量判断后，影像会直接开始生成。"}
            </p>
            {stage === "quality-blocked" && quality && <QualityDetails result={quality} />}
            {stage === "checking" ? (
              <div className={styles.checkingLine} role="status" aria-live="polite"><span />正在判断照片质量</div>
            ) : (
              <button type="button" className={styles.primaryAction} onClick={() => fileInputRef.current?.click()}>
                {stage === "quality-blocked" ? "换一张照片" : "选择一张照片"}
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
              JPG、PNG、HEIC 或 WebP，20MB 以内。照片只在当前设备完成本次预览。
            </p>
          </div>
          <aside className={styles.photoGuide} aria-label="照片建议">
            <span>01</span>
            <p>让 TA 在画面中央</p>
            <span>02</span>
            <p>尽量选择清晰正脸</p>
            <span>03</span>
            <p>避免强烈逆光或遮挡</p>
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
            <p className={styles.eyebrow}>星空电影正在生成</p>
            <h1 id={titleId}>{FORMING_COPY[formingStep][0]}</h1>
            <p>{FORMING_COPY[formingStep][1]}</p>
          </div>
          <div className={styles.formingProgress} aria-hidden="true"><span style={{ "--forming-step": formingStep } as React.CSSProperties} /></div>
          <p className={styles.formatNote}>10 秒 · 9:16 · 静音 · 无口型</p>
        </section>
      )}

      {(stage === "reveal" || stage === "choice" || stage === "save-prompt") && photoUrl && (
        <section className={styles.revealScene}>
          <div className={styles.cinemaBackdrop} style={{ backgroundImage: `url("${photoUrl}")` }} aria-hidden="true" />
          <div
            key={previewRun}
            className={`${styles.cinemaFrame} ${previewRun % 2 === 0 ? styles.takeOne : styles.takeTwo} ${stage !== "reveal" ? styles.previewComplete : ""}`}
            aria-label="TA 的十秒静音动态预览"
          >
            <div className={styles.cinemaImage} style={{ backgroundImage: `url("${photoUrl}")` }} />
            <div className={styles.cinemaLight} aria-hidden="true" />
            <div className={styles.cinemaVignette} aria-hidden="true" />
            {stage === "reveal" && (
              <>
                <p className={styles.firstPresence}>TA，第一次出现在这里</p>
                <div className={styles.previewClock}>
                  <span>第一次出现</span>
                  <b>00:{String(previewSeconds).padStart(2, "0")}</b>
                </div>
                <div className={styles.previewTimeline} aria-label="十秒预览播放进度"><span /></div>
              </>
            )}
          </div>

          {stage === "choice" && (
            <div className={styles.choicePanel}>
              <p className={styles.eyebrow}>这一次出现结束了</p>
              <h1 id={titleId}>你想把这一刻留在哪里？</h1>
              <p>免费预览还没有保存。你可以先再看一种出现方式，或了解如何把它留进影像库。</p>
              <div className={styles.choiceActions}>
                <button type="button" className={styles.primaryAction} onClick={() => setStage("save-prompt")}>把这一刻留下</button>
                <button type="button" className={styles.quietAction} onClick={continueGenerating}>再生成一次</button>
              </div>
            </div>
          )}

          {stage === "save-prompt" && (
            <div className={styles.saveSheet} role="dialog" aria-modal="true" aria-labelledby={`${titleId}-save`}>
              <span className={styles.sheetHandle} aria-hidden="true" />
              <p className={styles.eyebrow}>保存之前</p>
              <h1 id={`${titleId}-save`}>先把这份心意放好。</h1>
              <p>这次免费预览还没有保存。登录并确认照片使用权后，影像才会进入长期影像库；这里不会突然扣费。</p>
              <div className={styles.choiceActions}>
                <button type="button" className={styles.primaryAction} onClick={() => setStage("library")}>先看影像库</button>
                <button type="button" className={styles.quietAction} onClick={onRequestAccount ?? closeExperience}>登录后保存</button>
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
            <h1 id={titleId}>TA 的影像，会在这里慢慢聚成星光。</h1>
            <p>愿意留下的动态影像会按时间被收好。免费预览不会自动保存，也不会占用任何额度。</p>
          </div>
          <div className={styles.libraryGrid}>
            <article className={styles.libraryItem}>
              <div className={styles.libraryPortrait} style={{ backgroundImage: `url("${photoUrl}")` }}>
                <span>10 秒 · 静音</span>
              </div>
              <div className={styles.libraryItemMeta}>
                <div><strong>第一次出现</strong><p>刚刚生成</p></div>
                <span>本次预览 · 未保存</span>
              </div>
            </article>
            <button type="button" className={styles.newTake} onClick={continueGenerating}>
              <span>再看一种出现</span>
              <small>沿用这张照片，不会保存</small>
            </button>
          </div>
          <div className={styles.libraryFooter}>
            <p>想长期留住这段影像时，我们会先请你登录并确认照片使用权。</p>
            <button type="button" className={styles.quietAction} onClick={() => setStage("save-prompt")}>了解如何保存</button>
          </div>
        </section>
      )}
    </main>
  );
}
