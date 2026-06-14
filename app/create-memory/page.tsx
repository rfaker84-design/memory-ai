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

  const uploadFile = async (bucket: string, file: File): Promise<string | null> => {
    const fileName = `${Date.now()}-${file.name}`;

    const { error } = await supabase.storage
      .from(bucket)
      .upload(fileName, file, { upsert: true });

    if (error) {
      alert(`${bucket} 上传失败：${error.message}`);
      return null;
    }

    const { data } = supabase.storage.from(bucket).getPublicUrl(fileName);
    return data.publicUrl;
  };

  const handleCreate = async () => {
    if (!phone) return alert("请先登录");
    if (!name.trim()) return alert("请输入姓名");
    if (!relationship.trim()) return alert("请输入关系");
    if (!authorized) return alert("请确认你拥有上传资料的合法授权");

    setLoading(true);

    let photoUrl: string | null = null;
    let voiceUrl: string | null = null;

    if (photoFile) {
      photoUrl = await uploadFile("photos", photoFile);
      if (!photoUrl) {
        setLoading(false);
        return;
      }
    }

    if (voiceFile) {
      if (voiceFile.size > 20 * 1024 * 1024) {
        setLoading(false);
        alert("语音文件不能超过20MB");
        return;
      }

      voiceUrl = await uploadFile("voice-files", voiceFile);
      if (!voiceUrl) {
        setLoading(false);
        return;
      }
    }

    const { error } = await supabase.from("memories").insert([
      {
        user_phone: phone,
        name,
        relationship,
        life_story: lifeStory,
        photo_url: photoUrl,
        voice_url: voiceUrl,
      },
    ]);

    setLoading(false);

    if (error) {
      alert("创建失败：" + error.message);
      return;
    }

    alert("创建成功");
    window.location.href = "/memories";
  };

  return (
    <main className="min-h-screen bg-neutral-50 px-6 py-12">
      <div className="mx-auto max-w-2xl rounded-2xl bg-white p-8 shadow-sm">
        <h1 className="mb-6 text-3xl font-bold">创建记忆体</h1>

        <p className="mb-4 text-sm text-neutral-500">
          当前账号：{phone || "未登录"}
        </p>

        <input
          className="mb-4 w-full rounded-lg border p-3"
          placeholder="姓名"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />

        <input
          className="mb-4 w-full rounded-lg border p-3"
          placeholder="关系（父亲、母亲、爷爷等）"
          value={relationship}
          onChange={(e) => setRelationship(e.target.value)}
        />

        <textarea
          className="mb-4 w-full rounded-lg border p-3"
          rows={6}
          placeholder="人生故事"
          value={lifeStory}
          onChange={(e) => setLifeStory(e.target.value)}
        />

        <div className="mb-4 rounded-lg border p-3">
          <p className="mb-2 font-semibold">上传照片</p>
          <input
            type="file"
            accept="image/*"
            onChange={(e) => setPhotoFile(e.target.files?.[0] || null)}
          />
        </div>

        <div className="mb-4 rounded-lg border p-3">
          <p className="mb-2 font-semibold">上传语音</p>
          <input
            type="file"
            accept="audio/*,.mp3,.wav,.m4a"
            onChange={(e) => setVoiceFile(e.target.files?.[0] || null)}
          />
          <p className="mt-2 text-sm text-neutral-500">
            支持 mp3 / wav / m4a，最大20MB
          </p>
        </div>

        <label className="mb-6 flex gap-2 text-sm text-neutral-700">
          <input
            type="checkbox"
            checked={authorized}
            onChange={(e) => setAuthorized(e.target.checked)}
          />
          我确认已获得照片、声音及相关资料的合法使用授权。
        </label>

        <button
          onClick={handleCreate}
          disabled={loading}
          className="w-full rounded-lg bg-black px-6 py-3 text-white disabled:opacity-50"
        >
          {loading ? "创建中..." : "创建记忆体"}
        </button>
      </div>
    </main>
  );
}
