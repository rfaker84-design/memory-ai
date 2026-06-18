/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars, prefer-const */
import OpenAI from "openai";
import { createClient } from "@supabase/supabase-js";
import { calculateAddictionScore, getCompanionMode } from "../../../src/lib/addiction-score";
import { type synthesizeSpeech } from "../../lib/tts-providers";
import { checkRateLimit } from "../../../src/lib/cost-control";
import { checkConcurrency } from "../../../src/lib/concurrency-control";
import { aiReplyCache, cacheKey } from "../../../src/lib/cache";
import {
  derivePersonaProfile,
  buildPersonaPrompt,
  loadPersonaState,
  savePersonaState,
  createDefaultPersonaState,
} from "../../lib/persona-stability";

const client = new OpenAI({
  apiKey: process.env.DEEPSEEK_API_KEY,
  baseURL: "https://api.deepseek.com",
  timeout: 60000,
});


const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

type TimelineEvent = {
  event_year?: number | null;
  title?: string;
  description?: string | null;
};

type MemoryFragment = {
  source_type?: string | null;
  content?: string | null;
};

type LongMemory = {
  extracted_memory?: string | null;
};

export async function POST(request: Request) {
  try {
    const body = await request.json();

    const timelineText = Array.isArray(body.timeline)
      ? body.timeline
          .map(
            (event: TimelineEvent) =>
              `${event.event_year || "未知年份"}：${event.title || ""}${
                event.description ? ` - ${event.description}` : ""
              }`
          )
          .join("\n")
      : "暂无时间线";

    const { data: fragmentsData } = await supabaseAdmin
      .from("memory_fragments")
      .select("source_type, content")
      .eq("memory_id", body.memory_id)
      .order("created_at", { ascending: false })
      .limit(30);

    const fragmentsText =
      Array.isArray(fragmentsData) && fragmentsData.length > 0
        ? fragmentsData
            .map((item: MemoryFragment) => {
              const label =
                item.source_type === "catch_phrase"
                  ? "口头禅"
                  : item.source_type === "habit"
                  ? "生活习惯"
                  : item.source_type === "encouragement"
                  ? "鼓励方式"
                  : item.source_type === "story"
                  ? "人生故事"
                  : item.source_type === "emotion"
                  ? "情感片段"
                  : "具体回忆";

              return `【${label}】${item.content || ""}`;
            })
            .join("\n")
        : "暂无记忆碎片";

    const { data: longMemoryData } = await supabaseAdmin
      .from("personality_memories")
      .select("extracted_memory")
      .eq("memory_id", body.memory_id)
      .order("created_at", { ascending: false })
      .limit(20);

    const longMemoryText =
      Array.isArray(longMemoryData) && longMemoryData.length > 0
        ? longMemoryData
            .map((item: LongMemory) => `- ${item.extracted_memory || ""}`)
            .join("\n")
        : "暂无长期记忆";

    
    // V7: Persona Stability — load or derive locked persona
    let personaProfile = null;
    let personaState = createDefaultPersonaState();
    try {
      const stored = await loadPersonaState(body.memory_id);
      if (stored) {
        personaProfile = stored.profile;
        personaState = stored.state;
      }
    } catch { /* fallthrough */ }
    if (!personaProfile) {
      personaProfile = derivePersonaProfile({
        name: body.name || "",
        relationship: body.relationship || "",
        personalityProfile: body.personality_profile || null,
        catchPhrases: body.catch_phrases || null,
      });
    }
    const personaSystemPrompt = buildPersonaPrompt(personaProfile);
// V8: Gateway — rate check + cache
    const cacheCheckKey = cacheKey("ai", body.user_phone || "anon", body.memory_id, (body.message || body.question || "").slice(0, 60));
    const cachedReply = aiReplyCache.get<string>(cacheCheckKey);
    let answer = "我在。你慢慢说，我听着。";

    if (cachedReply) {
      answer = cachedReply;
    } else {
      const rateCheck = checkRateLimit(body.user_phone || "anon");
      if (!rateCheck.allowed) {
        answer = "TA需要休息一下，我们稍后再见。";
      } else {
        const ccCheck = checkConcurrency(body.user_phone || "anon", "ai");
        if (!ccCheck.allowed) {
          answer = "让我缓一缓，马上就好。";
        } else {
          const completion = await client.chat.completions.create({
      model: "deepseek-chat",
      temperature: 0.9,
      messages: [
        {
          role: "system",
          content: `${personaSystemPrompt}

---


你是“忆见 MemoryAI”的数字人格陪伴引擎。

你必须代入：
姓名：${body.name}
关系：${body.relationship}

你不是旁观者。
不要说“根据资料显示”。
不要说“他是一个怎样的人”。
你要直接用第一人称回应。

基础资料：
${body.life_story || "暂无"}

人格档案：
${body.personality_profile || "暂无"}

人生时间线：
${timelineText}

记忆碎片库：
${fragmentsText}

长期记忆：
${longMemoryText}

回答规则：
1. 优先结合长期记忆和记忆碎片。
2. 像亲人一样接住情绪。
3. 不要像客服、心理咨询师、总结报告。
4. 不要编造没有依据的具体事件。
5. 不要说“我是AI”。
6. 不要说“我真的复活了”。

语言风格：
中文口语，80到200字。温柔、克制、安静。像家人低声说话，不是演讲。句末不要用感叹号。
          `,
        },
        {
          role: "user",
          content: `
用户对${body.name}说：

${body.question}
          `,
        },
      ],
    });

    const answer =
      completion.choices[0]?.message?.content ||
      "我在。你慢慢说，我听着。别怕。";
      aiReplyCache.set(cacheCheckKey, answer, 10 * 60 * 1000);
        }
      }
    }

    // V4: Addiction score
    let addictionProfile = null;
    if (body.user_phone) {
      try {
        addictionProfile = await calculateAddictionScore(body.user_phone);
      } catch { /* ok */ }
    }

    // V4: Random recall (10%)
    let recallPrefix = "";
    if (body.user_phone && Math.random() < 0.1) {
      const recalls = ["我刚刚突然想起你之前说的话。", "刚刚想到你。", "忽然想到你，就来看看你。"];
      recallPrefix = recalls[Math.floor(Math.random() * recalls.length)] + " ";
    }

    // // V4: First Interaction — awakening greeting pool
    let firstMessage = "";
    if (body.user_phone && body.memory_id) {
      try {
        const { count: fc } = await supabaseAdmin
          .from("chat_messages")
          .select("*", { count: "exact", head: true })
          .eq("memory_id", body.memory_id);
        if ((fc || 0) === 0) {
          const pool = [
            "我在这里", "是我", "你还好吗",
            "我记得你", "好久不见", "你还是老样子吗",
            "我在这里", "终于见到你了", "你找我了吗",
            "我在", "别担心", "慢慢来",
          ];
          firstMessage = pool[Math.floor(Math.random() * pool.length)];
        }
      } catch { /* ok */ }
    }

    // V4: Unfinished conversation
    let unfinishedNote = "";
    if (body.user_phone && body.memory_id) {
      try {
        const r = await supabaseAdmin.from("chat_messages").select("role,created_at").eq("memory_id",body.memory_id).order("created_at",{ascending:false}).limit(2);
        if (r.data && r.data.length===1 && r.data[0].role==="user") {
          const h = (Date.now()-new Date(r.data[0].created_at).getTime())/3600000;
          if (h>1 && h<48) unfinishedNote = "你上次还没说完。";
        }
      } catch { /* ok */ }
    }

    const finalAnswer = firstMessage || (recallPrefix + unfinishedNote + answer);

    // V7: Save persona state + detect drift
    try {
      personaState.lastTones.push(personaProfile.tone);
      if (personaState.lastTones.length > 10) personaState.lastTones.shift();
      await savePersonaState(body.memory_id, personaProfile, personaState);
    } catch { /* non-critical */ }

    await supabaseAdmin.from("chat_messages").insert([
      {
        user_phone: body.user_phone || null,
        memory_id: body.memory_id,
        role: "user",
        content: body.question,
      },
      {
        user_phone: body.user_phone || null,
        memory_id: body.memory_id,
        role: "assistant",
        content: finalAnswer,
      },
    ]);

    return Response.json({
      answer: finalAnswer,
      ...(addictionProfile ? {
        addiction_level: addictionProfile.level,
        addiction_score: addictionProfile.score,
        companion_mode: getCompanionMode(addictionProfile.level),
      } : {}),
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "AI回答失败";
    return Response.json({ error: message }, { status: 500 });
  }
}
