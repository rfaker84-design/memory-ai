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
      setError("请填写 TA 的称呼，并选择你们的关系。");
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
    if (validateStage(1, draft)) {
      setError("请确认资料使用权与隐私说明后再继续。");
      return;
    }
    submitting.current = true;
    setError("");
    setCreationUncertain(false);
    setAwakening(true);
    setStatus("submitting");
    let recoveryWritten = false;
    try {
      if (birthDate) {
        const profile = await saveAdultBirthDate(birthDate);
        if (!profile.adultEligible) throw new AccountProfileRequestError("ADULT_ELIGIBILITY_REQUIRED");
      }
      await recordTrustConsent("adult_eligibility");
      await recordTrustConsent("memory_profile");
      if (!writeCreationRecovery({ idempotencyKey, phase: "creating" })) {
        throw new Error("CREATION_RECOVERY_UNAVAILABLE");
      }
      recoveryWritten = true;
      await new Promise((resolve) => window.setTimeout(resolve, reducedMotion ? 120 : 1050));
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
    return <main className={styles.scene}>
      <section className={styles.awakening} aria-live="polite">
        <div className={styles.stars} />
        <div className={styles.awakeningPhoto}>
          {photoPreview
            ? <img src={photoPreview} alt="即将进入回忆的 TA 照片" />
            : <span>动态效果演示<br />非真实 AI 生成视频</span>}
        </div>
        <p>正在整理关于 TA 的记忆……</p>
        <p>正在寻找 TA 留下的痕迹……</p>
      </section>
    </main>;
  }

  return <main className={styles.scene}>
    <section className={styles.shell}>
      <section className={styles.presence} aria-hidden="true"><div className={styles.aura} /><div className={styles.figure} /></section>
      <section className={styles.panel}>
        {created ? <div className={styles.success}>
          <div className={styles.eyebrow}>记忆已经收好</div>
          <h1 className={styles.title}>{created.name}，已经在这里了。</h1>
          <p className={styles.desc}>这是 AI 纪念陪伴，不代表真实意识或真实出现。</p>
          <MemoryButton onClick={() => router.replace("/memory-world")}>进入相伴</MemoryButton>
        </div> : <>
          <div className={styles.progress} aria-label={`第 ${stage + 1} 步，共 2 步`}><span className={styles.active} /><span className={stage === 1 ? styles.active : ""} /></div>
          <div className={styles.eyebrow}>{stage === 0 ? "01 开始回忆" : "02 留下 TA 的痕迹"}</div>
          <h1 className={styles.title}>{stage === 0 ? "想让谁，再一次出现在你的记忆里？" : "留下 TA 的痕迹"}</h1>
          <p className={styles.desc}>{stage === 0 ? "先从一个称呼开始。" : "照片、生日和一句话，都可以跳过或以后补充。"}</p>
          <div className={styles.step} key={reducedMotion ? "still" : stage}>
            {stage === 0 ? <>
              <MemoryInput label="TA 称呼 *" value={draft.name} onChange={(event: ChangeEvent<HTMLInputElement>) => { update("name", event.currentTarget.value); update("preferredAddress", event.currentTarget.value); }} placeholder="例如：妈妈、爸爸、奶奶" autoFocus />
              <div className={styles.relationships}>{relationships.map((item) => <button type="button" key={item} className={draft.relationship === item ? styles.relationshipActive : styles.relationship} onClick={() => update("relationship", item)}>{item}</button>)}</div>
            </> : <>
              <label className={styles.file}>选择一张照片<small>{photo?.name || "可跳过 · JPG、PNG、WebP，最大 20MB"}</small><input type="file" accept="image/*" onChange={choosePhoto} /></label>
              <MemoryInput label="生日（可选）" type="date" value={birthDate} onChange={(event: ChangeEvent<HTMLInputElement>) => setBirthDate(event.currentTarget.value)} />
              <MemoryInput multiline label="如果 TA 现在看到你，TA 最可能说什么？（可选）" value={draft.catchPhrases} onChange={(event: ChangeEvent<HTMLTextAreaElement>) => update("catchPhrases", event.currentTarget.value)} />
              <p className={styles.safetyCopy}>首发只收集你选择提交的照片和文字资料，不收集声音文件，也不提供声音克隆。未来回应越能贴近你确认的内容；忆见不是现实中的 TA。</p>
              <label className={styles.consent}><input type="checkbox" checked={draft.consent} onChange={(event) => update("consent", event.target.checked)} /><span>我已年满 18 周岁，确认拥有资料使用权，并同意隐私说明。</span></label>
            </>}
          </div>
          {error && <p className={styles.error} role="alert">{error}</p>}
          <div className={styles.actions}>
            {stage === 1 && <MemoryButton variant="ghost" onClick={() => setStage(0)}>上一步</MemoryButton>}
            {stage === 0
              ? <MemoryButton onClick={moveNext}>继续</MemoryButton>
              : <MemoryButton loading={status === "submitting" || status === "uploading"} onClick={creationUncertain ? recoverCreation : create}>{creationUncertain ? "确认创建结果" : "唤醒 TA"}</MemoryButton>}
          </div>
        </>}
      </section>
    </section>
  </main>;
}
