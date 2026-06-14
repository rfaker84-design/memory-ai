"use client";

import { useEffect, useState } from "react";
import { supabase } from "../../src/lib/supabase";

export default function CreateMemoryPage() {
  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [relationship, setRelationship] = useState("");
  const [lifeStory, setLifeStory] = useState("");
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [voiceFile, setVoiceFile] = useState<File | null>(null);
  const [authorized, setAuthorized] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const savedPhone = localStorage.getItem("yijian_phone");

    if (!savedPhone) {
      window.location.href = "/login";
      return;
    }

    setPhone(savedPhone);
  }, []);

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

  const handleCreate = async () => {
    try {
      if (!name.trim()) return alert("请输入姓名");
      if (!relationship.trim()) return alert("请输入关系");
      if (!lifeStory.trim()) return alert("请输入人生故事");
      if (!authorized) return alert("请确认授权");

      setLoading(true);

      const photoUrl = photoFile
        ? await uploadFile("/api/upload", photoFile)
        : null;

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

      alert("创建成功，数字人格资料已保存");
      window.location.href = "/memories";
    } catch (error) {
      console.error(error);
      alert("创建失败");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-neutral-50 px-6 py-12">
      <div className="mx-auto max-w-2xl rounded-2xl bg-white p-8 shadow-sm">
        <h1 className="mb-6 text-3xl font-bold">创建数字人格</h1>

        <input
          className="mb-4 w-full rounded-lg border p-3"
          placeholder="姓名"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />

        <input
          className="mb-4 w-full rounded-lg border p-3"
          placeholder="关系，例如：父亲、母亲、爷爷"
          value={relationship}
          onChange={(e) => setRelationship(e.target.value)}
        />

        <textarea
          className="mb-4 w-full rounded-lg border p-3"
          rows={8}
          placeholder="请尽量详细描述TA的性格、经历、说话方式、口头禅、习惯、价值观、与你之间的回忆。"
          value={lifeStory}
          onChange={(e) => setLifeStory(e.target.value)}
        />

        <div className="mb-4 rounded-xl border p-4">
          <p className="mb-2 font-medium">上传照片</p>
          <input
            type="file"
            accept="image/*"
            onChange={(e) => setPhotoFile(e.target.files?.[0] || null)}
          />
        </div>

        <div className="mb-4 rounded-xl border p-4">
          <p className="mb-2 font-medium">上传声音样本</p>
          <p className="mb-3 text-sm text-neutral-500">
            建议上传10秒以上清晰人声，后续用于声音克隆训练。
          </p>
          <input
            type="file"
            accept="audio/*"
            onChange={(e) => setVoiceFile(e.target.files?.[0] || null)}
          />
        </div>

        <label className="mb-6 flex gap-2 text-sm">
          <input
            type="checkbox"
            checked={authorized}
            onChange={(e) => setAuthorized(e.target.checked)}
          />
          我确认拥有相关照片、声音、故事和资料的合法授权
        </label>

        <button
          onClick={handleCreate}
          disabled={loading}
          className="w-full rounded-lg bg-black py-3 text-white disabled:opacity-50"
        >
          {loading ? "正在创建数字人格..." : "创建数字人格"}
        </button>
      </div>
    </main>
  );
}
