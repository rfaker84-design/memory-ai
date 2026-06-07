"use client";

import { useState } from "react";
import { supabase } from "../../src/lib/supabase";

export default function CreateMemoryPage() {
  const [name, setName] = useState("");
  const [relationship, setRelationship] = useState("");
  const [lifeStory, setLifeStory] = useState("");
  const [photo, setPhoto] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    if (!name.trim() || !relationship.trim()) {
      alert("请填写姓名和关系");
      return;
    }

    setLoading(true);

    let photoUrl: string | null = null;

    if (photo) {
      const fileName = `${Date.now()}-${photo.name}`;

      const { error: uploadError } = await supabase.storage
        .from("photos")
        .upload(fileName, photo);

      if (uploadError) {
        alert("照片上传失败：" + uploadError.message);
        setLoading(false);
        return;
      }

      const { data, error: signedError } = await supabase.storage
        .from("photos")
        .createSignedUrl(fileName, 60 * 60 * 24 * 365);

      if (signedError) {
        alert("照片地址生成失败：" + signedError.message);
        setLoading(false);
        return;
      }

      photoUrl = data.signedUrl;
    }

    const { error } = await supabase.from("memories").insert([
      {
        name,
        relationship,
        life_story: lifeStory,
        photo_url: photoUrl,
      },
    ]);

    setLoading(false);

    if (error) {
      alert("保存失败：" + error.message);
      return;
    }

    alert("保存成功");
    setName("");
    setRelationship("");
    setLifeStory("");
    setPhoto(null);
  };

  return (
    <main className="min-h-screen bg-neutral-50 px-6 py-12">
      <div className="mx-auto max-w-2xl rounded-2xl bg-white p-8 shadow-sm">
        <h1 className="mb-2 text-3xl font-bold text-neutral-900">
          创建亲人记忆体
        </h1>

        <p className="mb-8 text-neutral-600">
          上传照片并记录故事，创建 AI 记忆体。
        </p>

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
          placeholder="人生故事"
          rows={8}
          value={lifeStory}
          onChange={(e) => setLifeStory(e.target.value)}
        />

        <input
          type="file"
          accept="image/*"
          className="mb-6"
          onChange={(e) => setPhoto(e.target.files?.[0] || null)}
        />

        <button
          onClick={handleSubmit}
          disabled={loading}
          className="rounded-lg bg-black px-6 py-3 text-white disabled:opacity-50"
        >
          {loading ? "保存中..." : "保存记忆体"}
        </button>
      </div>
    </main>
  );
}
