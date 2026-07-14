import OpenAI from "@/src/server/legacy-openai";
import { createClient } from "@/src/server/legacy-supabase";

const client = new OpenAI({
  apiKey: process.env.DEEPSEEK_API_KEY,
  baseURL: "https://api.deepseek.com",
  timeout: 60000,
});

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const EMOTION_TAGS = ["感动", "思念", "温暖", "遗憾", "搞笑", "励志", "治愈", "怀旧", "感恩"] as const;

interface ShareGenerateRequest {
  memory_id?: string;
  user_phone?: string;
  chat_content?: string;
  message_id?: string;
  action?: string;
  from_user?: string;
  share_id?: string;
}

/**
 * POST /api/share/generate
 * 从聊天或主动消息生成分享卡片
 */
export async function POST(request: Request) {
  try {
    const body: ShareGenerateRequest = await request.json();
    const { memory_id, user_phone, chat_content, message_id } = body;

    const { action } = body;

    // 裂变追踪
    if (action === "track_referral") {
      const { from_user, share_id } = body;
      if (from_user && share_id) {
        await supabaseAdmin.from("referrals").insert({
          from_user,
          to_user: user_phone || null,
          share_id,
        }).select().maybeSingle();
        return Response.json({ success: true, tracked: true });
      }
      return Response.json({ error: "缺少参数" }, { status: 400 });
    }

    if (!memory_id) {
      return Response.json({ error: "缺少 memory_id" }, { status: 400 });
    }

    // 1. 获取记忆体信息
    const { data: memory } = await supabaseAdmin
      .from("memories")
      .select("id, name, relationship, life_story, personality_type, photo_url")
      .eq("id", memory_id)
      .maybeSingle();

    if (!memory) {
      return Response.json({ error: "记忆体不存在" }, { status: 404 });
    }

    // 2. 获取要分享的内容
    let shareContent = chat_content || "";

    if (!shareContent && message_id) {
      // 从 proactive_messages 取
      const { data: pm } = await supabaseAdmin
        .from("proactive_messages")
        .select("content")
        .eq("id", message_id)
        .maybeSingle();
      if (pm) shareContent = pm.content;
    }

    if (!shareContent) {
      // 从最近的 AI 回复中提取
      const { data: recentMsgs } = await supabaseAdmin
        .from("chat_messages")
        .select("content, role, emotion")
        .eq("memory_id", memory_id)
        .eq("role", "assistant")
        .order("created_at", { ascending: false })
        .limit(5);

      if (recentMsgs && recentMsgs.length > 0) {
        shareContent = recentMsgs
          .map((m: { content: string }) => m.content)
          .filter(Boolean)
          .slice(0, 2)
          .join("\n");
      }
    }

    if (!shareContent) {
      shareContent = `${memory.name}会陪在你身边。`;
    }

    // 3. 分析情绪标签
    const emotionResult = await detectEmotionTag(shareContent);

    // 4. 用 DeepSeek 生成分享标题和文案
    const generated = await generateShareCopy(
      memory.name,
      memory.relationship || "家人",
      shareContent,
      emotionResult.emotion_tag
    );

    // 5. 存入 share_cards
    const { data: card, error } = await supabaseAdmin
      .from("share_cards")
      .insert({
        memory_id,
        user_phone: user_phone || null,
        content_text: generated.content_text,
        emotion_tag: emotionResult.emotion_tag,
        share_title: generated.share_title,
        video_url: null,   // 后续异步生成
        audio_url: null,   // 后续异步生成
      })
      .select()
      .single();

    if (error) throw error;

    // 6. 异步生成视频和音频（不阻塞返回）
    generateMediaAsync(card.id, memory, generated.content_text, emotionResult.emotion_tag)
      .catch((err) => console.error("Media generation failed:", err.message));

    return Response.json({
      success: true,
      card: {
        id: card.id,
        memory_name: memory.name,
        relationship: memory.relationship,
        emotion_tag: emotionResult.emotion_tag,
        share_title: generated.share_title,
        content_text: generated.content_text,
        photo_url: memory.photo_url,
        share_url: `/share/${card.id}`,
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "生成失败";
    return Response.json({ error: message }, { status: 500 });
  }
}

/**
 * GET /api/share/generate
 * 根据已有 share_card ID 获取分享数据
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const card_id = searchParams.get("card_id");

  if (!card_id) {
    return Response.json({ error: "缺少 card_id" }, { status: 400 });
  }

  try {
    const { data: card } = await supabaseAdmin
      .from("share_cards")
      .select("*, memories(name, relationship, photo_url)")
      .eq("id", card_id)
      .maybeSingle();

    if (!card) {
      return Response.json({ error: "卡片不存在" }, { status: 404 });
    }

    return Response.json({ card });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "获取失败";
    return Response.json({ error: message }, { status: 500 });
  }
}

/** 简单规则情绪标签检测 */
async function detectEmotionTag(text: string): Promise<{ emotion_tag: string }> {
  const rules: Record<string, string[]> = {
    "感动": ["感谢", "谢谢", "感动", "恩情", "报答", "亏欠"],
    "思念": ["想你", "思念", "怀念", "相见", "见你", "梦里"],
    "温暖": ["温暖", "开心", "幸福", "快乐", "真好", "哈哈"],
    "遗憾": ["遗憾", "对不起", "后悔", "如果", "要是", "可惜"],
    "搞笑": ["笑死", "搞笑", "哈哈", "逗", "可爱", "好玩"],
    "励志": ["加油", "坚持", "努力", "相信", "一定", "未来"],
    "治愈": ["没事", "慢慢来", "休息", "别怕", "在呢", "陪你"],
    "怀旧": ["以前", "小时候", "记得", "那时候", "老家", "过去"],
    "感恩": ["恩", "养育", "辛苦", "操劳", "付出", "一辈子"],
  };

  let bestTag = "治愈";
  let bestScore = 0;

  for (const [tag, keywords] of Object.entries(rules)) {
    let score = 0;
    for (const kw of keywords) {
      if (text.includes(kw)) score++;
    }
    if (score > bestScore) {
      bestScore = score;
      bestTag = tag;
    }
  }

  return { emotion_tag: bestTag };
}

/** DeepSeek 生成分享标题和文案 */
async function generateShareCopy(
  name: string,
  relationship: string,
  content: string,
  emotionTag: string
): Promise<{ share_title: string; content_text: string }> {
  try {
    const completion = await client.chat.completions.create({
      model: "deepseek-chat",
      temperature: 0.8,
      max_tokens: 400,
      messages: [
        {
          role: "system",
          content: `你是忆见 MemoryAI 的内容运营。你的任务是把AI数字人格的对话转化为有传播力的分享卡片。

规则：
1. 生成一个 10-20 字的分享标题，要引发情感共鸣
2. 生成 50-80 字的分享文案，保持原始对话的情感基调
3. 不要编造内容，基于给定对话改编
4. 语气温暖、真实，像朋友分享故事
5. 不要出现"AI""数字人""系统"等词汇

返回 JSON 格式：{"share_title": "...", "content_text": "..."}`,
        },
        {
          role: "user",
          content: `记忆体名称：${name}
关系：${relationship}
情绪标签：${emotionTag}
对话内容：${content}

请生成分享标题和文案。`,
        },
      ],
    });

    const text = completion.choices[0]?.message?.content || "";
    // 尝试解析 JSON
    try {
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return {
          share_title: parsed.share_title || `${name}对我说的话`,
          content_text: parsed.content_text || content.substring(0, 80),
        };
      }
    } catch { /* fallback */ }

    return {
      share_title: `${name}对我说的话`,
      content_text: content.substring(0, 80),
    };
  } catch {
    return {
      share_title: `${name}对我说的话`,
      content_text: content.substring(0, 80),
    };
  }
}

/** 异步生成媒体文件（音频 + 视频占位） */
async function generateMediaAsync(
  cardId: string,
  memory: { id: string; name: string; photo_url?: string },
  contentText: string,
  emotionTag: string
) {
  try {
    // 调用 TTS 生成音频
    const ttsResponse = await fetch(`${process.env.NEXT_PUBLIC_SITE_URL || "http://127.0.0.1:3000"}/api/tts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text: contentText.substring(0, 200),
        voice_type: "101001", // 通用音色
      }),
    });

    if (ttsResponse.ok) {
      const { audio_url } = await ttsResponse.json();
      await supabaseAdmin
        .from("share_cards")
        .update({ audio_url: audio_url || null })
        .eq("id", cardId);
    }
  } catch (err) {
    console.error("Media generation error:", err);
  }
}
