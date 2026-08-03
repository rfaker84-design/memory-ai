"use client";

import { ChangeEvent, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { MemoryButton, MemoryInput } from "../memory-ui";
import { useReducedMotion } from "../../motion";
import { useCreateMemoryDraft } from "./useCreateMemoryDraft";
import type { CreateStage } from "./types";
import { canEnterConversation, completion, creationCompletionStatus, createMemoryRequestHeaders, validateStage } from "./createMemoryLogic";
import { recordTrustConsent, TrustConsentRequestError } from "../trust/trustConsentClient";
import { AccountProfileRequestError, saveAdultBirthDate } from "../trust/accountProfileClient";
import {
  clearCreationRecovery,
  CreationRecoveryRequestError,
  fetchCreationJson,
  recoverCreatedMemory,
  uploadCurrentCreationMedia,
  writeCreationRecovery,
} from "../first-presence/creationRecoveryClient";
import styles from "./CreateMemoryExperience.module.css";

const stages = [
  ["01 身份", "先告诉我们，TA是谁"], ["02 记忆", "只记录你愿意确认的事实"],
  ["03 素材与授权", "素材留在本次会话，绝不写入本地草稿"], ["04 预览与创建", "确认后写入你的记忆空间"],
] as const;

type UploadState = "idle" | "selected" | "uploading" | "ready" | "unavailable" | "error";
type CreatedMemory = { id: string; name: string };

export function CreateMemoryExperience() {
  const router = useRouter();
  const reducedMotion = useReducedMotion();
  const { draft, status, setStatus, update, clear, idempotencyKey } = useCreateMemoryDraft();
  const [stage, setStage] = useState<CreateStage>(0);
  const [photo, setPhoto] = useState<File | null>(null);
  const [birthDate, setBirthDate] = useState("");
  const [uploadState, setUploadState] = useState<UploadState>("idle");
  const [error, setError] = useState("");
  const [created, setCreated] = useState<CreatedMemory | null>(null);
  const [creationUncertain, setCreationUncertain] = useState(false);
  const submitting = useRef(false);

  const completeness = completion(draft);
  const clarity = 0.36 + stage * .13 + completeness * .002;
  const blur = Math.max(2, 16 - stage * 3 - completeness * .045);

  const validate = () => {
    const validationError = validateStage(stage, draft);
    if (stage === 0 && !birthDate) {
      setError("请填写你的出生日期。忆见首发仅向年满 18 周岁的用户提供服务。"); return false;
    }
    if (validationError === "identity-required") {
      setError("请先完成姓名、关系、称呼和创建目的。即使资料很少，也可以在下一步选择稍后补充。"); return false;
    }
    if (validationError === "consent-required") { setError("创建前需要确认你拥有素材使用权，并同意隐私说明。"); return false; }
    setError(""); return true;
  };

  const next = () => { if (validate()) setStage(current => Math.min(3, current + 1) as CreateStage); };
  const choosePhoto = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null;
    if (file && (!file.type.startsWith("image/") || file.size > 20 * 1024 * 1024)) { setError("请选择 20MB 以内的照片文件。"); return; }
    setPhoto(file);
    setUploadState(file ? "selected" : "idle"); setError("");
  };

  const uploadSelectedMedia = async (memoryId: string) => {
    const files = { photo: photo ?? undefined };
    if (!files.photo) return [];

    setStatus("uploading");
    setUploadState("uploading");
    await recordTrustConsent("media_asset", memoryId);
    try {
      const assets = await uploadCurrentCreationMedia({ memoryId, idempotencyKey, files });
      setUploadState("ready");
      return assets;
    } catch (error) {
      setUploadState("error");
      throw error;
    }
  };

  const completeCreation = async (createdMemory: CreatedMemory) => {
    setCreated(createdMemory);
    try {
      await uploadSelectedMedia(createdMemory.id);
      clearCreationRecovery();
      setStatus(creationCompletionStatus(true));
      clear();
    } catch (mediaError) {
      setStatus(creationCompletionStatus(false));
      setError(mediaError instanceof Error ? mediaError.message : "MEDIA_UPLOAD_FAILED");
    }
  };

  const create = async () => {
    if (submitting.current || created || !validate()) return;
    submitting.current = true; setError("");
    try {
      setStatus("submitting");
      const adultProfile = await saveAdultBirthDate(birthDate);
      if (!adultProfile.adultEligible) throw new AccountProfileRequestError("ADULT_ELIGIBILITY_REQUIRED");
      await recordTrustConsent("adult_eligibility");
      await recordTrustConsent("memory_profile");
      if (!writeCreationRecovery({ idempotencyKey, phase: "creating" })) {
        throw new Error("CREATION_RECOVERY_UNAVAILABLE");
      }
      const fragments = [
        ["personality", draft.personality], ["catch_phrase", draft.catchPhrases], ["shared_experience", draft.sharedExperiences],
        ["life_moment", draft.lifeMoments], ["interest", draft.interests], ["purpose", draft.purpose], ["preferred_address", draft.preferredAddress],
      ].filter(([, content]) => content.trim()).map(([sourceType, content]) => ({ sourceType, content }));
      const { response, body: data } = await fetchCreationJson("/api/memories", { method: "POST", credentials: "same-origin", headers: createMemoryRequestHeaders(idempotencyKey), body: JSON.stringify({
        name: draft.name.trim(), relationship: draft.relationship.trim(),
        lifeStory: [draft.sharedExperiences, draft.lifeMoments].filter(Boolean).join("\n\n") || null,
        personalityProfile: draft.personality.trim() || null, catchPhrases: draft.catchPhrases.trim() || null,
        personalityTags: draft.interests.split(/[，,、\n]/).map(v => v.trim()).filter(Boolean), photoUrl: null, fragments,
      }) });
      if (!response.ok || typeof data.id !== "string") {
        throw new Error(typeof data.error === "string" ? data.error : "创建失败，请重试。");
      }
      const createdMemory = { id: data.id, name: typeof data.name === "string" ? data.name : draft.name };
      await completeCreation(createdMemory);
    } catch (cause) {
      if (cause instanceof TrustConsentRequestError) {
        setStatus("recoverable-error"); setError("确认记录暂未安全保存；尚未创建 TA 或上传素材。恢复连接后可明确重试。");
        return;
      }
      if (cause instanceof AccountProfileRequestError) {
        setStatus("recoverable-error");
        setError(cause.code === "ADULT_ELIGIBILITY_REQUIRED" ? "忆见首发仅向年满 18 周岁的用户提供服务。" : "出生日期尚未安全保存；尚未创建 TA 或上传素材。请检查后明确重试。");
        return;
      }
      if (cause instanceof CreationRecoveryRequestError && cause.code === "CREATION_REQUEST_TIMEOUT") {
        setCreationUncertain(true);
        setStatus("recoverable-error");
        setError("创建结果尚未确认。不会再次提交创建请求；请先确认这次创建结果。");
        return;
      }
      setStatus("recoverable-error"); setError(cause instanceof Error ? cause.message : "创建失败，请重试。");
    } finally { submitting.current = false; }
  };

  const recoverCreation = async () => {
    if (submitting.current || created || !creationUncertain) return;
    submitting.current = true;
    setError("");
    try {
      const memory = await recoverCreatedMemory(idempotencyKey);
      setCreationUncertain(false);
      await completeCreation({ id: memory.id, name: memory.name || draft.name });
    } catch (cause) {
      if (cause instanceof CreationRecoveryRequestError && cause.status === 404) {
        setError("创建结果尚未确认。请稍后再次确认；不会自动重新提交创建请求。");
      } else {
        setError("暂时无法确认创建结果。不会自动重新提交创建请求，请稍后再试。");
      }
    } finally { submitting.current = false; }
  };

  const retryMediaUpload = async () => {
    if (!created || submitting.current) return;
    submitting.current = true;
    setError("");
    try {
      await uploadSelectedMedia(created.id);
      setStatus(creationCompletionStatus(true));
      clear();
    } catch (cause) {
      setStatus(creationCompletionStatus(false));
      setError(cause instanceof Error ? cause.message : "MEDIA_UPLOAD_FAILED");
    } finally { submitting.current = false; }
  };

  if (status === "loading") return <main className={styles.scene} aria-busy="true" />;
  return <main className={styles.scene}>
    <button className={`${styles.skip} ${styles.back}`} onClick={() => stage ? setStage((stage - 1) as CreateStage) : router.back()} aria-label="返回">← 返回</button>
    <div className={styles.shell}>
      <section className={styles.presence} aria-label="人物资料预览">
        <div className={styles.aura} /><div className={styles.figure} style={{ "--blur": `${blur}px`, "--clarity": clarity } as React.CSSProperties}><div className={styles.head}/><div className={styles.body}/></div>
      </section>
      <section className={styles.panel}>
        {!created ? <>
          <div className={styles.progress} aria-label={`第 ${stage + 1} 步，共 4 步`}>{stages.map((_, index) => <span key={index} className={index <= stage ? styles.active : ""}/>)}</div>
          <div className={styles.eyebrow}>{stages[stage][0]}</div><h1 className={styles.title}>{stages[stage][1]}</h1>
          <p className={styles.desc}>{stage === 1 ? "所有内容都可以留空或稍后补充；空白不会被编造成事实。" : "资料越充实，未来回应越能贴近你确认的内容。"}</p>
          <div className={styles.step} key={reducedMotion ? "static" : stage}>
            {stage === 0 && <><MemoryInput label="你的出生日期 *" type="date" value={birthDate} onChange={(e: ChangeEvent<HTMLInputElement>) => setBirthDate(e.currentTarget.value)} autoFocus/><div className={styles.grid2}><MemoryInput label="姓名或昵称 *" value={draft.name} onChange={(e: ChangeEvent<HTMLInputElement>) => update("name", e.currentTarget.value)}/><MemoryInput label="与你的关系 *" value={draft.relationship} onChange={(e: ChangeEvent<HTMLInputElement>) => update("relationship", e.currentTarget.value)}/></div><MemoryInput label="你希望如何称呼 TA *" value={draft.preferredAddress} onChange={(e: ChangeEvent<HTMLInputElement>) => update("preferredAddress", e.currentTarget.value)}/><MemoryInput label="创建目的 *" value={draft.purpose} onChange={(e: ChangeEvent<HTMLInputElement>) => update("purpose", e.currentTarget.value)} placeholder="例如：保存共同记忆、获得陪伴"/></>}
            {stage === 1 && <><MemoryInput multiline label="性格" value={draft.personality} onChange={(e: ChangeEvent<HTMLTextAreaElement>) => update("personality", e.currentTarget.value)}/><MemoryInput multiline label="常说的话" value={draft.catchPhrases} onChange={(e: ChangeEvent<HTMLTextAreaElement>) => update("catchPhrases", e.currentTarget.value)}/><MemoryInput multiline label="共同经历" value={draft.sharedExperiences} onChange={(e: ChangeEvent<HTMLTextAreaElement>) => update("sharedExperiences", e.currentTarget.value)}/><div className={styles.grid2}><MemoryInput multiline label="生活片段" value={draft.lifeMoments} onChange={(e: ChangeEvent<HTMLTextAreaElement>) => update("lifeMoments", e.currentTarget.value)}/><MemoryInput multiline label="兴趣爱好" value={draft.interests} onChange={(e: ChangeEvent<HTMLTextAreaElement>) => update("interests", e.currentTarget.value)}/></div></>}
            {stage === 2 && <><label className={styles.file}>选择照片<small>{photo?.name || "JPG、PNG 等，最大 20MB"}</small><input type="file" accept="image/*" onChange={choosePhoto}/></label><div className={styles.muted}>首发只收集你选择提交的照片和文字资料，不收集声音文件，也不提供声音克隆。忆见的回应由 AI 生成，不是现实中的 TA；素材只在创建后上传，不会写入 localStorage。请先阅读 <a href="/privacy">隐私政策</a>、<a href="/terms">用户协议</a> 和 <a href="/authorization">AI 内容和素材说明</a>。数据删除或退款相关请求可从 <a href="/report">投诉与删除</a> 提交。</div><label className={styles.consent}><input type="checkbox" checked={draft.consent} onChange={e => update("consent", e.target.checked)}/><span>我已年满 18 周岁，理解 AI 内容说明，确认拥有上述照片和资料的合法使用权，并同意按隐私政策处理；创建和上传前会记录本次确认。</span></label></>}
            {stage === 3 && <><div className={styles.summary}><div className={styles.metric}><strong>{completeness}%</strong><span>资料完整度</span></div><div className={styles.metric}><strong>{[draft.personality, draft.catchPhrases, photo].filter(Boolean).length}</strong><span>已确认资料项</span></div></div><div className={styles.metric}><strong>{draft.name}</strong><span>{draft.relationship} · 你称呼 TA 为 {draft.preferredAddress}</span></div><div className={styles.muted}>待完善：{[!draft.personality && "性格", !draft.catchPhrases && "常说的话", !photo && "照片"].filter(Boolean).join("、") || "基础资料已齐全"}</div></>}
          </div>
          {error && <div className={styles.error} role="alert">{error}</div>}
          <div className={styles.status}>{status === "saving-draft" ? "正在保存草稿…" : status === "uploading" ? "正在上传素材…" : status === "submitting" ? "正在写入 PostgreSQL…" : uploadState === "unavailable" ? "素材服务尚未就绪" : "草稿已自动保存（不含素材）"}</div>
          <div className={styles.actions}>{stage > 0 && <MemoryButton variant="ghost" onClick={() => setStage((stage - 1) as CreateStage)}>上一步</MemoryButton>}{stage === 1 && <button className={styles.skip} onClick={() => setStage(2)}>稍后补充</button>}{stage < 3 ? <MemoryButton onClick={next} disabled={stage === 2 && !draft.consent}>继续</MemoryButton> : <MemoryButton loading={status === "submitting" || status === "uploading"} onClick={creationUncertain ? recoverCreation : create}>{creationUncertain ? "确认创建结果" : "创建 TA"}</MemoryButton>}</div>
        </> : <div className={styles.success}><div className={styles.eyebrow}>{status === "media-recovery" ? "素材等待确认" : "创建完成"}</div><h1 className={styles.title}>{status === "media-recovery" ? `${created.name} 已创建，素材尚未保存` : `${created.name} 的资料已保存`}</h1><p className={styles.desc}>{status === "media-recovery" ? "TA 资料已写入记忆空间，但所选素材尚未收到服务端确认。请使用同一 TA 明确重试上传。" : "资料已写入你的记忆空间。"}</p>{error && <p className={styles.error} role="alert">{error}</p>}{status === "media-recovery" && photo && <MemoryButton variant="secondary" onClick={retryMediaUpload}>重试素材上传</MemoryButton>}<MemoryButton onClick={() => router.push(`/memory-chat/${created.id}`)}>进入相伴</MemoryButton></div>}
      </section>
    </div>
  </main>;
}
