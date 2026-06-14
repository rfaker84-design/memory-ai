"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../src/lib/supabase";

const steps = [
  { title: "基本信息", desc: "TA是谁？" },
  { title: "常说的话", desc: "TA最爱说什么？" },
  { title: "喜欢做什么", desc: "TA的日常爱好" },
  { title: "生气时的样子", desc: "TA不开心时会怎样？" },
  { title: "怎么安慰人", desc: "TA如何表达关心？" },
  { title: "最难忘的事", desc: "你和TA之间最深刻的记忆" },
];

export default function CreateMemoryPage() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(false);

  // Step 1
  const [name, setName] = useState("");
  const [relationship, setRelationship] = useState("");
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState("");

  // Steps 2-6
  const [catchPhrases, setCatchPhrases] = useState("");
  const [habits, setHabits] = useState("");
  const [angerStyle, setAngerStyle] = useState("");
  const [comfortStyle, setComfortStyle] = useState("");
  const [memorableStory, setMemorableStory] = useState("");

  useEffect(() => {
    const p = localStorage.getItem("yijian_phone");
    if (!p) { window.location.href = "/login"; return; }
    setPhone(p);
  }, []);

  const handlePhoto = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPhotoFile(file);
    setPhotoPreview(URL.createObjectURL(file));
  };

  const uploadFile = async (url: string, file: File) => {
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch(url, { method: "POST", body: fd });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "上传失败");
    return data.url as string;
  };

  const handleSubmit = async () => {
    if (!name.trim() || !relationship.trim()) return;
    setLoading(true);

    try {
      let photoUrl = "";
      if (photoFile) {
        photoUrl = await uploadFile("/api/upload", photoFile);
      }

      // Generate personality profile from wizard answers
      const profileRes = await fetch("/api/generate-profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name, relationship,
          catch_phrases: catchPhrases,
          habits,
          anger_style: angerStyle,
          comfort_style: comfortStyle,
          memorable_story: memorableStory,
        }),
      });
      const profileData = await profileRes.json();
      const personalityProfile = profileData.profile || "";
      const speechStyle = profileData.speech_style || "";
      const personalityTags = profileData.tags || [];

      const { error } = await supabase.from("memories").insert([{
        user_phone: phone,
        name: name.trim(),
        relationship: relationship.trim(),
        photo_url: photoUrl || null,
        life_story: memorableStory,
        catch_phrases: catchPhrases,
        personality_profile: personalityProfile,
        speech_style: speechStyle,
        personality_tags: personalityTags,
      }]);

      if (error) throw new Error(error.message);

      // Save fragments
      const fragments = [
        { source_type: "catch_phrase", content: catchPhrases },
        { source_type: "habit", content: habits },
        { source_type: "anger_style", content: angerStyle },
        { source_type: "comfort_style", content: comfortStyle },
        { source_type: "story", content: memorableStory },
      ].filter(f => f.content.trim());

      if (fragments.length > 0) {
        const memoryRes = await supabase.from("memories").select("id").eq("user_phone", phone).order("created_at", { ascending: false }).limit(1).single();
        const memoryId = memoryRes.data?.id;
        if (memoryId) {
          await supabase.from("memory_fragments").insert(
            fragments.map(f => ({ memory_id: memoryId, ...f }))
          );
        }
      }

      router.push("/");
    } catch (err: unknown) {
      alert("创建失败：" + (err instanceof Error ? err.message : "未知错误"));
    } finally {
      setLoading(false);
    }
  };

  const canNext = () => {
    if (step === 0) return name.trim() && relationship.trim();
    if (step === 1) return catchPhrases.trim();
    if (step === 2) return habits.trim();
    if (step === 3) return angerStyle.trim();
    if (step === 4) return comfortStyle.trim();
    if (step === 5) return memorableStory.trim();
    return true;
  };

  return (
    <main className="min-h-screen bg-neutral-950 px-6 py-12">
      <div className="mx-auto max-w-lg">
        {/* Progress */}
        <div className="mb-8">
          <div className="flex gap-1">
            {steps.map((_, i) => (
              <div key={i} className={"h-1 flex-1 rounded-full " + (i <= step ? "bg-white" : "bg-white/10")} />
            ))}
          </div>
          <p className="mt-4 text-sm text-white/40">步骤 {step + 1} / {steps.length}</p>
          <h2 className="mt-1 text-2xl font-light text-white">{steps[step].title}</h2>
          <p className="mt-1 text-white/30">{steps[step].desc}</p>
        </div>

        {/* Step 0: Basic Info */}
        {step === 0 && (
          <div className="space-y-5">
            {/* Photo */}
            <div className="flex justify-center">
              <label className="group relative flex h-32 w-32 cursor-pointer items-center justify-center overflow-hidden rounded-full bg-white/5 ring-1 ring-white/10 transition-all hover:bg-white/10">
                {photoPreview ? (
                  <img src={photoPreview} className="h-full w-full object-cover" alt="" />
                ) : (
                  <div className="text-center text-white/30">
                    <p className="text-3xl">+</p>
                    <p className="mt-1 text-xs">照片</p>
                  </div>
                )}
                <input type="file" accept="image/*" onChange={handlePhoto} className="hidden" />
              </label>
            </div>
            <input className="w-full rounded-xl bg-white/5 px-5 py-4 text-white placeholder-white/20 outline-none focus:bg-white/10"
              placeholder="TA的名字" value={name} onChange={e => setName(e.target.value)} />
            <input className="w-full rounded-xl bg-white/5 px-5 py-4 text-white placeholder-white/20 outline-none focus:bg-white/10"
              placeholder="和你的关系（如：父亲、母亲、奶奶）" value={relationship} onChange={e => setRelationship(e.target.value)} />
          </div>
        )}

        {/* Step 1: Catch Phrases */}
        {step === 1 && (
          <textarea className="w-full rounded-xl bg-white/5 px-5 py-4 text-white placeholder-white/20 outline-none focus:bg-white/10 min-h-[160px]"
            placeholder={"TA最常说的话是什么？\n\n比如：\n- 口头禅\n- 经常挂在嘴边的话\n- 让你印象深刻的句子"}
            value={catchPhrases} onChange={e => setCatchPhrases(e.target.value)} />
        )}

        {/* Step 2: Habits */}
        {step === 2 && (
          <textarea className="w-full rounded-xl bg-white/5 px-5 py-4 text-white placeholder-white/20 outline-none focus:bg-white/10 min-h-[160px]"
            placeholder={"TA最喜欢做什么？\n\n比如：\n- 日常爱好\n- 休闲方式\n- 让TA开心的事"}
            value={habits} onChange={e => setHabits(e.target.value)} />
        )}

        {/* Step 3: Anger */}
        {step === 3 && (
          <textarea className="w-full rounded-xl bg-white/5 px-5 py-4 text-white placeholder-white/20 outline-none focus:bg-white/10 min-h-[160px]"
            placeholder={"TA不开心时会怎样？\n\n比如：\n- 会沉默还是发脾气？\n- 有什么特别的习惯？\n- 怎么才能让TA消气？"}
            value={angerStyle} onChange={e => setAngerStyle(e.target.value)} />
        )}

        {/* Step 4: Comfort */}
        {step === 4 && (
          <textarea className="w-full rounded-xl bg-white/5 px-5 py-4 text-white placeholder-white/20 outline-none focus:bg-white/10 min-h-[160px]"
            placeholder={"TA如何表达关心？\n\n比如：\n- 怎么安慰人？\n- 会说什么暖心的话？\n- 用什么方式表达爱？"}
            value={comfortStyle} onChange={e => setComfortStyle(e.target.value)} />
        )}

        {/* Step 5: Memorable Story */}
        {step === 5 && (
          <textarea className="w-full rounded-xl bg-white/5 px-5 py-4 text-white placeholder-white/20 outline-none focus:bg-white/10 min-h-[200px]"
            placeholder={"你和TA之间最难忘的一件事\n\n越具体越好，AI会根据这个故事理解TA是一个怎样的人。"}
            value={memorableStory} onChange={e => setMemorableStory(e.target.value)} />
        )}

        {/* Navigation */}
        <div className="mt-8 flex gap-3">
          {step > 0 && (
            <button onClick={() => setStep(step - 1)}
              className="rounded-xl bg-white/5 px-6 py-4 text-white/60 hover:bg-white/10">
              上一步
            </button>
          )}
          {step < 5 ? (
            <button onClick={() => setStep(step + 1)} disabled={!canNext()}
              className="ml-auto rounded-xl bg-white px-8 py-4 font-medium text-black disabled:opacity-20">
              下一步
            </button>
          ) : (
            <button onClick={handleSubmit} disabled={loading || !canNext()}
              className="ml-auto rounded-xl bg-white px-8 py-4 font-medium text-black disabled:opacity-20">
              {loading ? "正在创建..." : "创建数字人格"}
            </button>
          )}
        </div>
      </div>
    </main>
  );
}