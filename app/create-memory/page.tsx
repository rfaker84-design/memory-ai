"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../src/lib/supabase";
import { SoulAwakeningStage, stageText } from "./SoulAwakeningStage";
import type { SoulStage } from "./SoulBody";
import styles from "./create-memory.module.css";

function progressForMaterials(materials: {
  photo: boolean;
  video: boolean;
  voice: boolean;
  story: boolean;
}): SoulStage {
  const { photo, video, voice, story } = materials;

  if (photo && video && voice && story) return 100;
  if (story) return 80;
  if (voice) return 50;
  if (video) return 30;
  if (photo) return 10;
  return 0;
}

function UploadCard({
  title,
  helper,
  active,
  children,
}: {
  title: string;
  helper: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className={`${styles.uploadCard} ${active ? styles.uploadCardActive : ""}`}>
      <div className={styles.uploadCardHeader}>
        <div>
          <p>{title}</p>
          <span>{helper}</span>
        </div>
        <em>{active ? "已交给光" : "等待"}</em>
      </div>
      {children}
    </div>
  );
}

export default function CreateMemoryPage() {
  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [relationship, setRelationship] = useState("");
  const [lifeStory, setLifeStory] = useState("");
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [voiceFile, setVoiceFile] = useState<File | null>(null);
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [authorized, setAuthorized] = useState(false);
  const [loading, setLoading] = useState(false);
  const [authMode, setAuthMode] = useState("");
  const [entered, setEntered] = useState(false);

  useEffect(() => {
    const savedPhone = localStorage.getItem("yijian_phone");
    const savedAuthMode = localStorage.getItem("yijian_auth_mode");

    setAuthMode(savedAuthMode || (savedPhone ? "phone" : ""));

    if (!savedPhone && savedAuthMode !== "guest") {
      window.location.href = "/login";
      return;
    }

    if (savedPhone) {
      setPhone(savedPhone);
    }

    const frame = requestAnimationFrame(() => setEntered(true));
    return () => cancelAnimationFrame(frame);
  }, []);

  const progress = useMemo<SoulStage>(
    () =>
      progressForMaterials({
        photo: Boolean(photoFile),
        video: Boolean(videoFile),
        voice: Boolean(voiceFile),
        story: lifeStory.trim().length > 0,
      }),
    [lifeStory, photoFile, videoFile, voiceFile]
  );

  const uploadFile = async (url: string, file: File) => {
    const formData = new FormData();
    formData.append("file", file);

    const res = await fetch(url, {
      method: "POST",
      body: formData,
    });

    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.error || "上传失败");
    }

    return data.url;
  };

  const generateProfile = async () => {
    const res = await fetch("/api/generate-profile", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ name, relationship, lifeStory }),
    });

    const data = await res.json();

    if (!res.ok) return null;

    try {
      return JSON.parse(data.result);
    } catch {
      return null;
    }
  };

  const requireFullLogin = () => {
    if (authMode === "guest" || !phone) {
      alert("请先登录后使用完整功能");
      return false;
    }

    return true;
  };

  const handleCreate = async () => {
    try {
      if (!requireFullLogin()) return;
      if (!name.trim()) return alert("请留下TA的称呼");
      if (!relationship.trim()) return alert("请写下你和TA的关系");
      if (!lifeStory.trim()) return alert("请写下一段关于TA的故事");
      if (!authorized) return alert("请确认你拥有这些资料的授权");

      setLoading(true);

      const photoUrl = photoFile ? await uploadFile("/api/upload", photoFile) : null;

      const voiceUrl = voiceFile
        ? await uploadFile("/api/upload-voice", voiceFile)
        : null;

      const profile = await generateProfile();

      const { error } = await supabase.from("memories").insert([
        {
          user_phone: phone,
          name,
          relationship,
          life_story: lifeStory,
          photo_url: photoUrl,
          voice_sample_url: voiceUrl,
          voice_clone_status: voiceUrl ? "pending" : "not_started",
          personality_tags: profile?.personality_tags || "",
          speech_style: profile?.speech_style || "",
          catch_phrases: profile?.catch_phrases || "",
          values_belief: profile?.values_belief || "",
        },
      ]);

      if (error) {
        alert(error.message);
        return;
      }

      alert("唤醒资料已保存");
      window.location.href = "/memories";
    } catch (error) {
      console.error(error);
      alert("创建失败");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className={`${styles.pageShell} ${entered ? styles.pageShellEntered : ""}`}>
      <div className={styles.pageInner}>
        <header className={styles.heroText}>
          <p>创建数字生命</p>
          <h1>把思念慢慢交给光</h1>
        </header>

        <SoulAwakeningStage progress={progress} />

        <section className={styles.progressPanel} aria-label="唤醒进度">
          <div className={styles.progressMeta}>
            <span>{progress}%</span>
            <p>{stageText[progress]}</p>
          </div>
          <div className={styles.progressTrack}>
            <div
              className={styles.progressFill}
              style={{ width: `${progress}%` }}
            />
          </div>
        </section>

        <section className={styles.identityCard}>
          <label>
            <span>TA的称呼</span>
            <input
              placeholder="例如：妈妈、外公、阿姐"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <label>
            <span>你们的关系</span>
            <input
              placeholder="例如：母亲、父亲、朋友"
              value={relationship}
              onChange={(e) => setRelationship(e.target.value)}
            />
          </label>
        </section>

        <section className={styles.uploadGrid}>
          <UploadCard
            title="上传照片"
            helper="一张温柔的旧照就够了"
            active={Boolean(photoFile)}
          >
            <input
              type="file"
              accept="image/*"
              onChange={(e) => setPhotoFile(e.target.files?.[0] || null)}
            />
          </UploadCard>

          <UploadCard
            title="上传声音"
            helper="让一句熟悉的话回来"
            active={Boolean(voiceFile)}
          >
            <input
              type="file"
              accept="audio/*"
              onChange={(e) => setVoiceFile(e.target.files?.[0] || null)}
            />
          </UploadCard>

          <UploadCard
            title="写下故事"
            helper="记下TA如何爱过这个世界"
            active={lifeStory.trim().length > 0}
          >
            <textarea
              rows={6}
              placeholder="写下TA的性格、习惯、说话方式、口头禅，以及你最想留住的一段回忆。"
              value={lifeStory}
              onChange={(e) => setLifeStory(e.target.value)}
            />
          </UploadCard>

          <UploadCard
            title="上传视频"
            helper="让身影在光里更清晰一点"
            active={Boolean(videoFile)}
          >
            <input
              type="file"
              accept="video/*"
              onChange={(e) => setVideoFile(e.target.files?.[0] || null)}
            />
          </UploadCard>
        </section>

        <label className={styles.authorizeRow}>
          <input
            type="checkbox"
            checked={authorized}
            onChange={(e) => setAuthorized(e.target.checked)}
          />
          <span>我确认拥有相关照片、声音、故事和资料的合法授权</span>
        </label>

        <button
          onClick={handleCreate}
          disabled={loading}
          className={styles.createButton}
        >
          {loading ? "正在保存这束光..." : progress >= 100 ? "完成唤醒" : "继续创建"}
        </button>
      </div>
    </main>
  );
}



