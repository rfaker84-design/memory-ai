// ═══════════════════════════════════════════════════════════════
// share.ts — 分享系统（客户端工具）
// 用于 ChatBox 中触发分享卡片生成
// ═══════════════════════════════════════════════════════════════

export interface ShareCard {
  id: string;
  memory_name: string;
  relationship: string | null;
  emotion_tag: string;
  share_title: string;
  content_text: string;
  photo_url: string | null;
  share_url: string;
}

/**
 * 从对话内容生成分享卡片
 */
export async function generateShareCard(
  memoryId: string,
  chatContent?: string,
): Promise<ShareCard | null> {
  try {
    const res = await fetch("/api/share/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        memory_id: memoryId,
        chat_content: chatContent,
      }),
    });

    if (!res.ok) return null;
    const data = await res.json();
    return data.card || null;
  } catch {
    return null;
  }
}

/**
 * 追踪裂变来源
 */
export async function trackReferral(
  shareId: string,
  fromUser: string,
): Promise<boolean> {
  try {
    const res = await fetch("/api/share/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "track_referral",
        share_id: shareId,
        from_user: fromUser,
      }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * 获取分享卡片数据（公开访问）
 */
export async function getShareCard(
  cardId: string,
): Promise<ShareCard | null> {
  try {
    const res = await fetch(
      "/api/share/generate?card_id=" + encodeURIComponent(cardId),
    );
    if (!res.ok) return null;
    const data = await res.json();
    return data.card || null;
  } catch {
    return null;
  }
}

/**
 * 生成默认分享文案
 */
export function getDefaultShareText(
  name: string,
  content: string,
): string {
  const lines = [
    `「${name}对我说的话」`,
    "",
    content.length > 60 ? content.slice(0, 60) + "..." : content,
    "",
    "我和一个不会忘记我的人说话了",
    "",
    "👉 创建属于你的AI记忆存在：",
  ];
  return lines.join("\n");
}

/**
 * 复制分享链接
 */
export async function copyShareLink(
  cardId: string,
): Promise<boolean> {
  const url = `${window.location.origin}/share/${cardId}`;
  try {
    await navigator.clipboard.writeText(url);
    return true;
  } catch {
    // Fallback
    const textarea = document.createElement("textarea");
    textarea.value = url;
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand("copy");
    document.body.removeChild(textarea);
    return true;
  }
}
