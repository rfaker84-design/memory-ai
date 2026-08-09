"use client";

import { ChangeEvent, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { MemoryButton, MemoryInput } from "../memory-ui";
import { useReducedMotion } from "../../motion";
import { useCreateMemoryDraft } from "./useCreateMemoryDraft";
import { createMemoryRequestHeaders, validateStage } from "./createMemoryLogic";
import { recordTrustConsent } from "../trust/trustConsentClient";
import { AccountProfileRequestError, saveAdultBirthDate } from "../trust/accountProfileClient";
import {
  CreationRecoveryRequestError,
  fetchCreationJson,
  recoverCreatedMemory,
  uploadCurrentCreationMedia,
  writeCreationRecovery,
} from "../first-presence/creationRecoveryClient";
import styles from "./CreateMemoryExperience.module.css";

type CreatedMemory = { id: string; name: string };

const relationships = [
  { label: "父母", detail: "熟悉的牵挂" },
  { label: "伴侣", detail: "并肩的岁月" },
  { label: "子女", detail: "放不下的惦念" },
  { label: "朋友", detail: "一起走过的时光" },
  { label: "其他", detail: "一位很重要的人" },
];

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

  const create = async () => {
    if (submitting.current) return;
    const validationError = validateStage(1, draft, birthDate);
    if (validationError) {
      setError(validationError === "birth-date-required"
        ? "请填写生日，用于年龄确认和安全保护。"
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
      setAwakening(false);
      setStatus("recoverable-error");
      setCreationUncertain(
        recoveryWritten || (cause instanceof CreationRecoveryRequestError && cause.code === "CREATION_REQUEST_TIMEOUT"),
      );
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
          <p>正在整理关于 TA 的记忆……</p>
          <p>正在唤醒一段珍贵的回忆……</p>
        </div>
      </section>
    </main>;
  }

  return <main className={styles.scene}>
    <div className={styles.starField} aria-hidden="true" />
    <div className={styles.ambientGlow} aria-hidden="true" />
    <section className={styles.ritual}>
      {created ? <div className={styles.success}>
        <div className={styles.eyebrow}>记忆已经收好</div>
        <h1>{created.name}，已经在这里了。</h1>
        <p>这是 AI 纪念陪伴，不代表真实意识或真实出现。</p>
        <MemoryButton onClick={() => router.replace("/memory-world")}>进入相伴</MemoryButton>
      </div> : <>
        <div className={styles.stageMark} aria-label={`第 ${stage + 1} 步，共 2 步`}>
          <span className={styles.stageCurrent}>0{stage + 1}</span><i /><span>02</span>
        </div>
        {stage === 0 ? <section className={styles.invitation} key="invitation">
          <p className={styles.eyebrow}>从一句称呼开始</p>
          <h1>想让谁，<br /><em>再次出现在你的记忆里？</em></h1>
          <p className={styles.intro}>不用准备完整的故事。先把那个最熟悉的称呼，写在这里。</p>
          <label className={styles.memoryLine}>
            <span>我一直叫 TA</span>
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
          <div className={styles.relationshipMoment} aria-label="与 TA 的关系">
            <p>在我的记忆里，TA 是</p>
            <div className={styles.relationshipChoices}>
            {relationships.map((item) => <button type="button" key={item.label} className={draft.relationship === item.label ? styles.relationshipActive : styles.relationship} onClick={() => update("relationship", item.label)}>
              <strong>{item.label}</strong><span>{item.detail}</span>
            </button>)}
            </div>
          </div>
        </section> : <section className={styles.trace} key="trace">
          <p className={styles.eyebrow}>第二束光</p>
          <h1>留下 <em>TA 的痕迹</em></h1>
          <p className={styles.intro}>一张照片就够了。它会安静地留在这段回忆里。</p>
          <div className={styles.portraitAtmosphere}>
            <span className={styles.portraitAura} aria-hidden="true" />
            <span className={styles.portraitParticles} aria-hidden="true"><i /><i /><i /><i /><i /></span>
            <label className={styles.portraitStage}>
              {photoPreview ? <img src={photoPreview} alt="已选择的 TA 照片预览" /> : <span className={styles.portraitEmpty}><b>+</b><small>选择一张重要的照片</small><i>也可以稍后再留下</i></span>}
              <input type="file" accept="image/*" onChange={choosePhoto} />
              {photoPreview && <span className={styles.changePortrait}>换一张照片</span>}
            </label>
            {photoPreview && <p className={styles.portraitWhisper}>这张照片，会成为 TA 回来的第一束光。</p>}
          </div>
          <div className={styles.optionalDetails}>
            <MemoryInput label="生日" hint="用于年龄确认和安全保护" type="date" value={birthDate} onChange={(event: ChangeEvent<HTMLInputElement>) => setBirthDate(event.currentTarget.value)} required style={{ minHeight: 46, background: "rgba(255,255,255,.035)" }} />
            <MemoryInput multiline label="如果 TA 现在看到你，TA 最可能说什么？（可选）" value={draft.catchPhrases} onChange={(event: ChangeEvent<HTMLTextAreaElement>) => update("catchPhrases", event.currentTarget.value)} style={{ minHeight: 96, background: "rgba(255,255,255,.035)" }} />
          </div>
          <p className={styles.safetyCopy}>首发只收集你选择提交的照片和文字资料，不收集声音文件，也不提供声音克隆。未来回应越能贴近你确认的内容；忆见不是现实中的 TA。</p>
          <label className={styles.consent}><input type="checkbox" checked={draft.consent} onChange={(event) => update("consent", event.target.checked)} /><span>我已年满 18 周岁，确认拥有资料使用权，并同意隐私说明。</span></label>
        </section>}
        {error && <p className={styles.error} role="alert">{error}</p>}
        <div className={styles.actions}>
          {stage === 1 && <MemoryButton variant="ghost" onClick={() => setStage(0)}>上一步</MemoryButton>}
          {stage === 0
            ? <MemoryButton onClick={moveNext} style={{ minWidth: 132 }}>继续</MemoryButton>
            : <MemoryButton loading={status === "submitting" || status === "uploading"} onClick={creationUncertain ? recoverCreation : create} style={{ minWidth: 148 }}>{creationUncertain ? "确认创建结果" : "唤醒 TA"}</MemoryButton>}
        </div>
      </>}
    </section>
  </main>;
}
