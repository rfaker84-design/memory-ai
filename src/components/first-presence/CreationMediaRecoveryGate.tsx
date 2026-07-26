"use client";

import { ChangeEvent, useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import type { Memory } from "../../../features/memory/types";
import { MemoryButton } from "../memory-ui";
import { loadOwnedMediaUrl } from "../memory/ownedMemoryClient";
import {
  recordTrustConsent,
  TrustConsentRequestError,
} from "../trust/trustConsentClient";
import {
  clearCreationRecovery,
  clearTransientCreationMedia,
  CreationMediaKind,
  CreationRecoveryRequestError,
  mediaPhase,
  markTransientCreationMediaUploaded,
  phaseForRemainingMedia,
  readCreationRecovery,
  readTransientCreationMedia,
  recoverCreatedMemory,
  remainingMediaKinds,
  stageTransientCreationMedia,
  uploadCreationMedia,
  writeCreationRecovery,
} from "./creationRecoveryClient";
import { MemoryConversationScene } from "./MemoryConversationScene";
import styles from "./CreationMediaRecoveryGate.module.css";

type GatePhase = "checking" | "selection" | "uploading" | "error" | "conversation";
type SelectedMedia = Partial<Record<CreationMediaKind, File>>;

type Props = {
  memory: Memory;
  firstGreetingKey: string;
  initialPortraitUrl?: string | null;
  onLeave: () => void;
};

const MAX_MEDIA_BYTES = 20 * 1024 * 1024;

function mediaLabel(kind: CreationMediaKind) {
  return kind === "photo" ? "照片" : "声音";
}

export function CreationMediaRecoveryGate({
  memory,
  firstGreetingKey,
  initialPortraitUrl = null,
  onLeave,
}: Props) {
  const router = useRouter();
  const [phase, setPhase] = useState<GatePhase>("checking");
  const [remaining, setRemaining] = useState<CreationMediaKind[]>([]);
  const [selected, setSelected] = useState<SelectedMedia>({});
  const [portraitUrl, setPortraitUrl] = useState(initialPortraitUrl);
  const [notice, setNotice] = useState("");
  const initialized = useRef(false);
  const mediaConsentRecorded = useRef(false);

  const finishMediaRecovery = useCallback(() => {
    clearCreationRecovery();
    clearTransientCreationMedia(memory.id);
    setRemaining([]);
    setSelected({});
    setNotice("");
    setPhase("conversation");
  }, [memory.id]);

  const uploadAvailableMedia = useCallback(async (
    kinds: CreationMediaKind[],
    files: SelectedMedia,
  ) => {
    const record = readCreationRecovery();
    if (!record || record.memoryId !== memory.id) {
      setNotice("人物资料已经保存。请重新进入这段记忆后，再补充照片或声音。");
      setPhase("error");
      return;
    }

    const pending = new Set(kinds);
    const uploadable = kinds.filter((kind) => files[kind]);
    if (!uploadable.length) {
      setRemaining(kinds);
      setPhase("selection");
      return;
    }

    setPhase("uploading");
    setNotice("");
    try {
      if (!mediaConsentRecorded.current) {
        await recordTrustConsent("media_asset", memory.id);
        mediaConsentRecorded.current = true;
      }

      for (const kind of uploadable) {
        const file = files[kind];
        if (!file) continue;
        const result = await uploadCreationMedia(memory.id, file);
        if (kind === "photo") {
          try {
            setPortraitUrl(await loadOwnedMediaUrl(result.assetId));
          } catch {
            setPortraitUrl(null);
          }
        }
        markTransientCreationMediaUploaded(memory.id, kind);
        pending.delete(kind);
        const nextPhase = phaseForRemainingMedia(pending);
        writeCreationRecovery({
          idempotencyKey: record.idempotencyKey,
          memoryId: memory.id,
          phase: nextPhase,
        });
        setRemaining(Array.from(pending));
      }

      if (!pending.size) {
        finishMediaRecovery();
      } else {
        setSelected(readTransientCreationMedia(memory.id) ?? {});
        setNotice("已保存完成的素材不会再次上传。其余素材可以重新选择，或稍后补充。");
        setPhase("selection");
      }
    } catch (error) {
      setRemaining(Array.from(pending));
      if (
        (error instanceof CreationRecoveryRequestError && error.status === 401)
        || (error instanceof TrustConsentRequestError && error.code === "UNAUTHORIZED")
      ) {
        clearCreationRecovery();
        clearTransientCreationMedia(memory.id);
        router.replace("/login");
        return;
      }
      setNotice("素材还没有完整保存。已完成的部分不会重复上传，你可以稍后重试。");
      setPhase("error");
    }
  }, [finishMediaRecovery, memory.id, router]);

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;

    const initialize = async () => {
      let record = readCreationRecovery();
      const transient = readTransientCreationMedia(memory.id) ?? {};

      if (record?.phase === "creating" && !record.memoryId) {
        try {
          const recovered = await recoverCreatedMemory(record.idempotencyKey);
          const recoveredPhase = mediaPhase(
            Boolean(transient.photo),
            Boolean(transient.voice),
            !transient.photo && !transient.voice,
          );
          record = {
            idempotencyKey: record.idempotencyKey,
            memoryId: recovered.id,
            phase: recoveredPhase,
          };
          writeCreationRecovery(record);
          if (recovered.id !== memory.id) {
            router.replace(`/memory-chat/${encodeURIComponent(recovered.id)}`);
            return;
          }
        } catch (error) {
          if (error instanceof CreationRecoveryRequestError && error.status === 401) {
            clearCreationRecovery();
            router.replace("/login");
            return;
          }
          setNotice("暂时无法确认刚才保存的人物资料。系统不会重新创建 TA。");
          setPhase("error");
          return;
        }
      }

      if (!record || record.memoryId !== memory.id) {
        setPhase("conversation");
        return;
      }

      const kinds = remainingMediaKinds(record.phase, Boolean(memory.photoAssetId));
      if (!kinds.length) {
        finishMediaRecovery();
        return;
      }

      setRemaining(kinds);
      setSelected(transient);
      await uploadAvailableMedia(kinds, transient);
    };

    void initialize();
  }, [
    finishMediaRecovery,
    memory.id,
    memory.photoAssetId,
    router,
    uploadAvailableMedia,
  ]);

  const chooseMedia = (kind: CreationMediaKind, event: ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0] ?? null;
    if (!file) return;
    const valid = kind === "photo"
      ? file.type.startsWith("image/")
      : file.type.startsWith("audio/");
    if (!valid || file.size > MAX_MEDIA_BYTES) {
      setNotice("请选择 20MB 以内的照片或声音文件。");
      return;
    }
    const next = { ...selected, [kind]: file };
    setSelected(next);
    stageTransientCreationMedia(memory.id, { [kind]: file });
    setNotice("");
    setPhase("selection");
  };

  if (phase === "conversation") {
    return (
      <MemoryConversationScene
        memoryId={memory.id}
        memoryName={memory.name}
        firstGreetingKey={firstGreetingKey}
        initialPortraitUrl={portraitUrl}
        onLeave={onLeave}
      />
    );
  }

  const hasSelectedPending = remaining.some((kind) => selected[kind]);

  return (
    <section className={styles.recovery} aria-live="polite">
      <div className={styles.presence} aria-hidden="true">
        <div className={styles.orbit} />
        <div className={styles.portrait}>
          {portraitUrl ? (
            <div style={{ backgroundImage: `url("${portraitUrl}")` }} />
          ) : (
            <span>{Array.from(memory.name).slice(0, 2).join("")}</span>
          )}
        </div>
        <p>{memory.name}</p>
      </div>

      <div className={styles.copy}>
        <p className={styles.eyebrow}>人物资料已经保存</p>
        <h1>把尚未完成的素材留在这里。</h1>
        <p>人物资料已经保存。照片或声音尚未完成，你可以重新选择，或稍后补充。</p>

        {(phase === "checking" || phase === "uploading") && (
          <p className={styles.status} role="status">
            {phase === "uploading" ? "正在保存你选择的素材…" : "正在回到这段记忆…"}
          </p>
        )}

        {notice && <p className={styles.notice} role="alert">{notice}</p>}

        {phase === "error" && remaining.length === 0 && (
          <div className={styles.actions}>
            <MemoryButton onClick={() => window.location.reload()}>重新确认</MemoryButton>
          </div>
        )}

        {phase !== "checking" && phase !== "uploading" && remaining.length > 0 && (
          <>
            <div className={styles.choices}>
              {remaining.map((kind) => (
                <label key={kind} className={styles.mediaChoice}>
                  <strong>{selected[kind] ? `重新选择${mediaLabel(kind)}` : `选择${mediaLabel(kind)}`}</strong>
                  <span>{selected[kind]?.name ?? (kind === "photo" ? "JPG、PNG 等，最大 20MB" : "常见音频格式，最大 20MB")}</span>
                  <input
                    className={styles.fileInput}
                    type="file"
                    accept={kind === "photo" ? "image/*" : "audio/*"}
                    aria-label={`选择 TA 的${mediaLabel(kind)}`}
                    onChange={(event) => chooseMedia(kind, event)}
                  />
                </label>
              ))}
            </div>
            <div className={styles.actions}>
              <MemoryButton
                disabled={!hasSelectedPending}
                onClick={() => void uploadAvailableMedia(remaining, selected)}
              >
                继续保存素材
              </MemoryButton>
              <button type="button" onClick={finishMediaRecovery}>稍后补充</button>
            </div>
          </>
        )}
      </div>
    </section>
  );
}
