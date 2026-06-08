"use client";

import { useState } from "react";
import { supabase } from "../../src/lib/supabase";

export default function CreateMemoryPage() {
  const [name, setName] = useState("");
  const [relationship, setRelationship] = useState("");
  const [lifeStory, setLifeStory] = useState("");
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);

  const handleCreate = async () => {
    if (!name.trim() || !relationship.trim()) return alert("请输入姓名和关系");

    setLoading(true);

    let photoUrl: string | null = null;

    if (photoFile) {
      const fileName = `${Date.now()}-${photoFile.name}`;
      const { error: uploadError } = await supabase.storage
        .from("photos")
        .upload(fileName, photoFile, { cacheControl: "3600", upsert: true });

      if (uploadError) {
        setLoading(false);
        return alert(uploadError.message);
      }

      const { data } = supabase.storage.from("photos").getPublicUrl(fileName);
      photoUrl = data.publicUrl;
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

    if (error) return alert(error.message);

    alert("创建成功");
    setName(""); setRelationship(""); setLifeStory(""); setPhotoFile(null);
    window.location.href = "/memories";
  };

  return (
    <main className="min-h-screen bg-neutral-50 px-6 py-12">
      <div className="mx-auto max-w-2xl rounded-2xl bg-white p-8 shadow-sm">
        <h1 className="mb-6 text-3xl font-bold">创建记忆体</h1>

        <input className="mb-4 w-full rounded-lg border p-3" placeholder="姓名" value={name} onChange={e => setName(e.target.value)} />
        <input className="mb-4 w-full rounded-lg border p-3" placeholder="关系" value={relationship} onChange={e => setRelationship(e.target.value)} />
        <textarea className="mb-4 w-full rounded-lg border p-3" rows={6} placeholder="人生故事" value={lifeStory} onChange={e => setLifeStory(e.target.value)} />
        <input type="file" accept="image/*" className="mb-6 w-full" onChange={e => setPhotoFile(e.target.files?.[0] || null)} />

        <button onClick={handleCreate} disabled={loading} className="w-full rounded-lg bg-black px-6 py-3 text-white">
          {loading ? "创建中..." : "创建记忆体"}
        </button>
      </div>
    </main>
  );
}