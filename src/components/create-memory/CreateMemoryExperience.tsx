"use client";

import { ChangeEvent, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { MemoryButton, MemoryInput } from "../memory-ui";
import { useReducedMotion } from "../../motion";
import { useCreateMemoryDraft } from "./useCreateMemoryDraft";
import type { CreateStage } from "./types";
import { completion, validateStage } from "./createMemoryLogic";
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
  const { draft, status, setStatus, update, clear } = useCreateMemoryDraft();
  const [stage, setStage] = useState<CreateStage>(0);
  const [photo, setPhoto] = useState<File | null>(null);
  const [voice, setVoice] = useState<File | null>(null);
  const [photoUrl, setPhotoUrl] = useState("");
  const [uploadState, setUploadState] = useState<UploadState>("idle");
  const [error, setError] = useState("");
  const [created, setCreated] = useState<CreatedMemory | null>(null);
  const submitting = useRef(false);

  const filled = useMemo(() => [draft.name, draft.relationship, draft.preferredAddress, draft.purpose,
    draft.personality, draft.catchPhrases, draft.sharedExperiences, draft.lifeMoments, draft.interests].filter(v => v.trim()).length, [draft]);
  const completeness = completion(draft);
  const clarity = 0.36 + stage * .13 + completeness * .002;
  const blur = Math.max(2, 16 - stage * 3 - completeness * .045);

  const validate = () => {
    const validationError = validateStage(stage, draft);
    if (validationError === "identity-required") {
      setError("请先完成姓名、关系、称呼和创建目的。即使资料很少，也可以在下一步选择稍后补充。"); return false;
    }
    if (validationError === "consent-required") { setError("创建前需要确认你拥有素材使用权，并同意隐私说明。"); return false; }
    setError(""); return true;
  };

  const next = () => { if (validate()) setStage(current => Math.min(3, current + 1) as CreateStage); };
  const chooseFile = (kind: "photo" | "voice", event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null;
    const valid = kind === "photo" ? file?.type.startsWith("image/") : file?.type.startsWith("audio/");
    if (file && (!valid || file.size > 20 * 1024 * 1024)) { setError("请选择 20MB 以内的照片或声音文件。"); return; }
    kind === "photo" ? setPhoto(file) : setVoice(file); setUploadState(file ? "selected" : "idle"); setError("");
  };

  const uploadPhoto = async () => {
    if (!photo) return "";
    setStatus("uploading"); setUploadState("uploading");
    const body = new FormData(); body.append("file", photo);
    const response = await fetch("/api/media/upload", { method: "POST", body });
    if (response.status === 404 || response.status === 501 || response.status === 503) {
      setUploadState("unavailable"); throw new Error("素材上传服务尚未就绪。你可以移除素材后继续创建资料。");
    }
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.url) { setUploadState("error"); throw new Error(data.error || "素材上传失败，请重试或移除素材。"); }
    setPhotoUrl(data.url); setUploadState("ready"); return data.url as string;
  };

  const create = async () => {
    if (submitting.current || created || !validate()) return;
    submitting.current = true; setError("");
    try {
      const uploadedPhoto = photoUrl || await uploadPhoto();
      if (voice) {
        setStatus("uploading");
        const body = new FormData(); body.append("file", voice);
        const response = await fetch("/api/media/upload", { method: "POST", body });
        if (!response.ok) { setUploadState(response.status === 404 || response.status === 501 || response.status === 503 ? "unavailable" : "error"); throw new Error("声音上传服务尚未就绪。请移除声音后继续。"); }
      }
      setStatus("submitting");
      const fragments = [
        ["personality", draft.personality], ["catch_phrase", draft.catchPhrases], ["shared_experience", draft.sharedExperiences],
        ["life_moment", draft.lifeMoments], ["interest", draft.interests], ["purpose", draft.purpose], ["preferred_address", draft.preferredAddress],
      ].filter(([, content]) => content.trim()).map(([sourceType, content]) => ({ sourceType, content }));
      const response = await fetch("/api/memories", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
        userId: localStorage.getItem("yijian_phone"), name: draft.name.trim(), relationship: draft.relationship.trim(),
        lifeStory: [draft.sharedExperiences, draft.lifeMoments].filter(Boolean).join("\n\n") || null,
        personalityProfile: draft.personality.trim() || null, catchPhrases: draft.catchPhrases.trim() || null,
        personalityTags: draft.interests.split(/[，,、\n]/).map(v => v.trim()).filter(Boolean), photoUrl: uploadedPhoto || null, fragments,
      }) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "创建失败，请重试。");
      setCreated({ id: data.id, name: data.name || draft.name }); setStatus("success"); clear();
    } catch (cause) {
      setStatus("recoverable-error"); setError(cause instanceof Error ? cause.message : "创建失败，请重试。");
    } finally { submitting.current = false; }
  };

  if (status === "loading") return <main className={styles.scene} aria-busy="true" />;
  return <main className={styles.scene}>
    <button className={`${styles.skip} ${styles.back}`} onClick={() => stage ? setStage((stage - 1) as CreateStage) : router.back()} aria-label="返回">← 返回</button>
    <div className={styles.shell}>
      <section className={styles.presence} aria-label="逐渐清晰的存在体">
        <div className={styles.aura} /><div className={styles.figure} style={{ "--blur": `${blur}px`, "--clarity": clarity } as React.CSSProperties}><div className={styles.head}/><div className={styles.body}/></div>
      </section>
      <section className={styles.panel}>
        {!created ? <>
          <div className={styles.progress} aria-label={`第 ${stage + 1} 步，共 4 步`}>{stages.map((_, index) => <span key={index} className={index <= stage ? styles.active : ""}/>)}</div>
          <div className={styles.eyebrow}>{stages[stage][0]}</div><h1 className={styles.title}>{stages[stage][1]}</h1>
          <p className={styles.desc}>{stage === 1 ? "所有内容都可以留空或稍后补充；空白不会被编造成事实。" : "TA会随着真实资料的补充，逐渐清晰。"}</p>
          <div className={styles.step} key={reducedMotion ? "static" : stage}>
            {stage === 0 && <><div className={styles.grid2}><MemoryInput label="姓名或昵称 *" value={draft.name} onChange={(e: ChangeEvent<HTMLInputElement>) => update("name", e.currentTarget.value)} autoFocus/><MemoryInput label="与你的关系 *" value={draft.relationship} onChange={(e: ChangeEvent<HTMLInputElement>) => update("relationship", e.currentTarget.value)}/></div><MemoryInput label="你希望如何称呼 TA *" value={draft.preferredAddress} onChange={(e: ChangeEvent<HTMLInputElement>) => update("preferredAddress", e.currentTarget.value)}/><MemoryInput label="创建目的 *" value={draft.purpose} onChange={(e: ChangeEvent<HTMLInputElement>) => update("purpose", e.currentTarget.value)} placeholder="例如：保存共同记忆、获得陪伴"/></>}
            {stage === 1 && <><MemoryInput multiline label="性格" value={draft.personality} onChange={(e: ChangeEvent<HTMLTextAreaElement>) => update("personality", e.currentTarget.value)}/><MemoryInput multiline label="常说的话" value={draft.catchPhrases} onChange={(e: ChangeEvent<HTMLTextAreaElement>) => update("catchPhrases", e.currentTarget.value)}/><MemoryInput multiline label="共同经历" value={draft.sharedExperiences} onChange={(e: ChangeEvent<HTMLTextAreaElement>) => update("sharedExperiences", e.currentTarget.value)}/><div className={styles.grid2}><MemoryInput multiline label="生活片段" value={draft.lifeMoments} onChange={(e: ChangeEvent<HTMLTextAreaElement>) => update("lifeMoments", e.currentTarget.value)}/><MemoryInput multiline label="兴趣爱好" value={draft.interests} onChange={(e: ChangeEvent<HTMLTextAreaElement>) => update("interests", e.currentTarget.value)}/></div></>}
            {stage === 2 && <><label className={styles.file}>选择照片<small>{photo?.name || "JPG、PNG 等，最大 20MB"}</small><input type="file" accept="image/*" onChange={e => chooseFile("photo", e)}/></label><label className={styles.file}>选择声音文件<small>{voice?.name || "常见音频格式，最大 20MB"}</small><input type="file" accept="audio/*" onChange={e => chooseFile("voice", e)}/></label><div className={styles.muted}>素材仅在创建时上传，不会写入 localStorage。上传接口为 /api/media/upload；服务不可用时会明确提示。</div><label className={styles.consent}><input type="checkbox" checked={draft.consent} onChange={e => update("consent", e.target.checked)}/><span>我确认拥有上述素材的合法使用权，并同意素材用于创建 TA。敏感资料请仅在获得本人或权利人授权后提交。</span></label></>}
            {stage === 3 && <><div className={styles.summary}><div className={styles.metric}><strong>{completeness}%</strong><span>资料完整度</span></div><div className={styles.metric}><strong>{[draft.personality, draft.catchPhrases, photo, voice].filter(Boolean).length}</strong><span>已获得能力线索</span></div></div><div className={styles.metric}><strong>{draft.name}</strong><span>{draft.relationship} · 你称呼 TA 为 {draft.preferredAddress}</span></div><div className={styles.muted}>待完善：{[!draft.personality && "性格", !draft.catchPhrases && "常说的话", !photo && "照片", !voice && "声音"].filter(Boolean).join("、") || "基础资料已齐全"}</div></>}
          </div>
          {error && <div className={styles.error} role="alert">{error}</div>}
          <div className={styles.status}>{status === "saving-draft" ? "正在保存草稿…" : status === "uploading" ? "正在上传素材…" : status === "submitting" ? "正在写入 PostgreSQL…" : uploadState === "unavailable" ? "素材服务尚未就绪" : "草稿已自动保存（不含素材）"}</div>
          <div className={styles.actions}>{stage > 0 && <MemoryButton variant="ghost" onClick={() => setStage((stage - 1) as CreateStage)}>上一步</MemoryButton>}{stage === 1 && <button className={styles.skip} onClick={() => setStage(2)}>稍后补充</button>}{stage < 3 ? <MemoryButton onClick={next}>继续</MemoryButton> : <MemoryButton loading={status === "submitting" || status === "uploading"} onClick={create}>创建 TA</MemoryButton>}</div>
        </> : <div className={styles.success}><div className={styles.eyebrow}>创建完成</div><h1 className={styles.title}>{created.name} 正在变得清晰</h1><p className={styles.desc}>资料已写入你的记忆空间。</p><MemoryButton onClick={() => router.push(`/memory/${created.id}`)}>进入 TA 的详情</MemoryButton><MemoryButton variant="secondary" onClick={() => router.push(`/memory-chat/${created.id}`)}>开始对话</MemoryButton></div>}
      </section>
    </div>
  </main>;
}
