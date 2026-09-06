"use client";

import { ChangeEvent, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { MemoryButton } from "../memory-ui";
import { useReducedMotion } from "../../motion";
import { useCreateMemoryDraft } from "./useCreateMemoryDraft";
import { createMemoryRequestHeaders, validateStage } from "./createMemoryLogic";
import { recordTrustConsent } from "../trust/trustConsentClient";
import { AccountProfileRequestError, saveAdultBirthDate } from "../trust/accountProfileClient";
import {
  CreationRecoveryRequestError,
  clearCreationRecovery,
  fetchCreationJson,
  recoverCreatedMemory,
  uploadCurrentCreationMedia,
  writeCreationRecovery,
} from "../first-presence/creationRecoveryClient";
import styles from "./CreateMemoryExperience.module.css";

type CreatedMemory = { id: string; name: string };

const relationships = ["父母", "伴侣", "子女", "朋友", "其他"];

export function CreateMemoryExperience() {
  const router = useRouter();
  const reducedMotion = useReducedMotion();
  const { draft, status, setStatus, update, clear, idempotencyKey } = useCreateMemoryDraft();
  const [stage, setStage] = useState<0 | 1>(0);
  const [birthDate, setBirthDate] = useState("");
  const [photo, setPhoto] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState("");
  const [created, setCreated] = useState<CreatedMemory | null>(null);
  const [awakening, setAwakening] = useState(false);
  const [creationUncertain, setCreationUncertain] = useState(false);
  const [error, setError] = useState("");
  const submitting = useRef(false);

  useEffect(() => {
    if (!photo) { setPhotoPreview(""); return; }
    const objectUrl = URL.createObjectURL(photo);
    setPhotoPreview(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [photo]);

  useEffect(() => {
    if (!created) return;
    const timer = window.setTimeout(
      () => router.replace("/memory-world"),
      reducedMotion ? 80 : 650,
    );
    return () => window.clearTimeout(timer);
  }, [created, reducedMotion, router]);

  const moveNext = () => {
    if (validateStage(0, draft)) {
      setError("请写下 TA 的称呼，并选择你们的关系。");
      return;
    }
    setError("");
    setStage(1);
  };

  const choosePhoto = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0] ?? null;
    if (file && (!file.type.startsWith("image/") || file.size > 20 * 1024 * 1024)) {
      setError("请选择 20MB 以内的图片。");
      return;
    }
    setPhoto(file);
    setError("");
  };

  const completeCreatedMemory = async (memory: CreatedMemory) => {
    const files = photo ? { photo } : {};
    if (photo) await recordTrustConsent("media_asset", memory.id);
    setStatus("uploading");
    await uploadCurrentCreationMedia({ memoryId: memory.id, idempotencyKey, files });
    setCreated(memory);
    clear();
    setStatus("success");
  };

  const exitCreateFlow = () => {
    if (submitting.current) return;
    clear();
    clearCreationRecovery();
    setCreationUncertain(false);
    setError("");
    router.replace("/");
  };

  const create = async () => {
    if (submitting.current) return;
    const validationError = validateStage(1, draft, birthDate);
    if (validationError) {
      setError(validationError === "birth-date-required"
        ? "请填写你的生日（账户持有人），用于年龄确认和安全保护。"
        : "请确认资料使用权与隐私说明后再继续。");
      return;
    }
    submitting.current = true;
    setError("");
    setCreationUncertain(false);
    setAwakening(true);
    setStatus("submitting");
    let recoveryWritten = false;
    try {
      // Let the full-screen ritual establish itself before any network work can
      // resolve or reject. This keeps the transition legible without changing
      // the creation, consent, or recovery contracts.
      await new Promise((resolve) => window.setTimeout(resolve, reducedMotion ? 80 : 720));
      const profile = await saveAdultBirthDate(birthDate);
      if (!profile.adultEligible) throw new AccountProfileRequestError("ADULT_ELIGIBILITY_REQUIRED");
      await recordTrustConsent("adult_eligibility");
      await recordTrustConsent("memory_profile");
      if (!writeCreationRecovery({ idempotencyKey, phase: "creating" })) {
        throw new Error("CREATION_RECOVERY_UNAVAILABLE");
      }
      recoveryWritten = true;
      const { response, body } = await fetchCreationJson("/api/memories", {
        method: "POST",
        credentials: "same-origin",
        headers: createMemoryRequestHeaders(idempotencyKey),
        body: JSON.stringify({
          name: draft.name.trim(),
          relationship: draft.relationship,
          lifeStory: null,
          personalityProfile: null,
          catchPhrases: draft.catchPhrases.trim() || null,
          personalityTags: [],
          photoUrl: null,
          fragments: draft.catchPhrases.trim()
            ? [{ sourceType: "catch_phrase", content: draft.catchPhrases.trim() }]
            : [],
        }),
      });
      if (!response.ok || typeof body.id !== "string") {
        throw new Error(typeof body.error === "string" ? body.error : "CREATE_MEMORY_FAILED");
      }
      await completeCreatedMemory({
        id: body.id,
        name: typeof body.name === "string" ? body.name : draft.name,
      });
    } catch (cause) {
      const memoryLimitReached = cause instanceof Error && cause.message === "MEMORY_LIMIT_REACHED";
      setAwakening(false);
      setStatus("recoverable-error");
      if (memoryLimitReached) {
        clear();
        clearCreationRecovery();
        setCreationUncertain(false);
      } else {
        setCreationUncertain(
          recoveryWritten || (cause instanceof CreationRecoveryRequestError && cause.code === "CREATION_REQUEST_TIMEOUT"),
        );
      }
      setError(
        cause instanceof AccountProfileRequestError
          ? "首发服务仅面向年满 18 周岁的用户。"
          : cause instanceof Error ? cause.message : "暂时无法完成创建，请明确重试。",
      );
    } finally {
      submitting.current = false;
    }
  };

  const recoverCreation = async () => {
    if (submitting.current) return;
    submitting.current = true;
    setError("");
    setStatus("submitting");
    try {
      const recovered = await recoverCreatedMemory(idempotencyKey);
      await completeCreatedMemory({ id: recovered.id, name: recovered.name });
      setCreationUncertain(false);
    } catch (cause) {
      setStatus("recoverable-error");
      setError(cause instanceof Error ? cause.message : "CREATION_RECOVERY_FAILED");
    } finally {
      submitting.current = false;
    }
  };

  if (awakening && !created) {
    return <main className={styles.wakeScene}>
      <div className={styles.starField} aria-hidden="true" />
      <div className={styles.wakeExpansion} aria-hidden="true"><i /><i /><i /></div>
      <div className={styles.wakeRays} aria-hidden="true" />
      <div className={styles.wakeHalo} aria-hidden="true" />
      <section className={styles.wakeContent} aria-live="polite">
        <div className={styles.wakeOrb} aria-hidden="true"><span /><span /><span /><span /><span /></div>
        <div className={styles.wakePortraitShell}>
          <span className={styles.gatheringDust} aria-hidden="true"><i /><i /><i /><i /><i /><i /></span>
          <figure className={styles.wakePortrait}>
            {photoPreview
              ? <img src={photoPreview} alt="即将进入回忆的 TA 照片" />
              : <figcaption>动态效果演示<br />非真实 AI 生成视频</figcaption>}
          </figure>
        </div>
        <div className={styles.wakeCopy}>
          <p>正在生成影像</p>
          <p>通常需要一点时间。</p>
        </div>
      </section>
    </main>;
  }

  return <main className={styles.scene}>
    <div className={styles.roomBackdrop} aria-hidden="true" />
    <header className={styles.creationHeader}>
      <button
        type="button"
        className={styles.backButton}
        aria-label={stage === 0 ? "返回上一页" : "返回第一步"}
        onClick={() => stage === 0 ? exitCreateFlow() : setStage(0)}
      >
        <span aria-hidden="true">‹</span>
      </button>
      <span className={styles.brand}>忆见</span>
      <span className={styles.progress}>{stage + 1} / 2</span>
    </header>
    <section className={styles.ritual}>
      {created ? <div className={styles.success}>
        <div className={styles.eyebrow}>资料已完成</div>
        <h1>{created.name}的资料已保存。</h1>
        <p>AI 生成内容基于你确认的信息。</p>
        <MemoryButton onClick={() => router.replace("/memory-world")}>继续</MemoryButton>
      </div> : <>
        {stage === 0 ? <section className={styles.invitation} key="invitation">
          <div className={styles.paperSheet}>
            <div className={styles.paperCopy}>
              <h1>从一个称呼开始</h1>
              <p className={styles.intro}>写下那个你最熟悉的名字。</p>
            </div>
            <label className={styles.memoryLine}>
              <span>怎么称呼</span>
              <input
                aria-label="TA 称呼"
                value={draft.name}
                onChange={(event: ChangeEvent<HTMLInputElement>) => {
                  update("name", event.currentTarget.value);
                  update("preferredAddress", event.currentTarget.value);
                }}
                placeholder="妈妈"
                autoFocus
              />
            </label>
            <div className={styles.relationshipMoment} aria-label="你们的关系">
              <p>你们的关系</p>
              <div className={styles.relationshipChoices}>
              {relationships.map((relationship) => <button type="button" key={relationship} className={draft.relationship === relationship ? styles.relationshipActive : styles.relationship} onClick={() => update("relationship", relationship)}>
                <strong>{relationship}</strong><span aria-hidden="true" />
              </button>)}
              </div>
            </div>
          </div>
          {error && <p className={styles.error} role="alert">{error}</p>}
          <div className={styles.actions}>
            <MemoryButton className={styles.primaryAction} onClick={moveNext} rightSlot={<span aria-hidden="true">→</span>}>下一步</MemoryButton>
          </div>
        </section> : <section className={styles.trace} key="trace">
          <div className={styles.photoPaper}>
            <label className={styles.portraitStage}>
              {photoPreview ? <img src={photoPreview} alt="已选择的照片预览" /> : <span className={styles.portraitEmpty}><b>+</b><small>放上一张照片</small><i>选择照片</i></span>}
              <input type="file" accept="image/*" onChange={choosePhoto} />
              <span className={styles.changePortrait}>{photoPreview ? "更换照片" : "选择照片"}</span>
            </label>
          </div>
          <div className={styles.detailPaper}>
            <h1>放上一张照片</h1>
            <label className={styles.paperField}>
              <span>你的生日（账户持有人）</span>
              <input aria-label="你的生日（账户持有人）" aria-describedby="account-birthday-purpose" type="date" value={birthDate} onChange={(event: ChangeEvent<HTMLInputElement>) => setBirthDate(event.currentTarget.value)} required />
            </label>
            <label className={styles.paperField}>
              <span>补充一句（可选）</span>
              <textarea aria-label="补充一句（可选）" value={draft.catchPhrases} onChange={(event: ChangeEvent<HTMLTextAreaElement>) => update("catchPhrases", event.currentTarget.value)} placeholder="例如：她说话时很有耐心。" maxLength={30} />
              <small>{draft.catchPhrases.length} / 30</small>
            </label>
            <label className={styles.consent}><input type="checkbox" checked={draft.consent} onChange={(event) => update("consent", event.target.checked)} /><span>我确认有权使用这张照片，并了解生成内容由 AI 合成。</span></label>
            <p id="account-birthday-purpose" className={styles.safetyCopy}>此处填写账户持有人的生日，用于年龄与安全确认，不是 TA 的生日。我们只处理你主动提交的照片和文字资料。</p>
            {error && <p className={styles.error} role="alert">{error}</p>}
            <div className={styles.actions}>
              <MemoryButton className={styles.primaryAction} loading={status === "submitting" || status === "uploading"} onClick={creationUncertain ? recoverCreation : create} rightSlot={<span aria-hidden="true">→</span>}>{creationUncertain ? "确认结果" : "完成"}</MemoryButton>
            </div>
          </div>
        </section>}
      </>}
    </section>
  </main>;
}
