/**
 * 忆见病毒传播系统 - 媒体生成工具
 * 生成 OG 图片用于社交分享预览
 */

export interface ShareMediaInput {
  name: string;
  relationship: string;
  emotionTag: string;
  shareTitle: string;
  contentText: string;
  photoUrl?: string | null;
}

const EMOTION_COLORS: Record<string, { bg: string; fg: string }> = {
  "感动": { bg: "#4c1d95", fg: "#c4b5fd" },
  "思念": { bg: "#1e1b4b", fg: "#a5b4fc" },
  "温暖": { bg: "#9d174d", fg: "#f9a8d4" },
  "遗憾": { bg: "#27272a", fg: "#d4d4d8" },
  "搞笑": { bg: "#0c4a6e", fg: "#67e8f9" },
  "励志": { bg: "#064e3b", fg: "#6ee7b7" },
  "治愈": { bg: "#0f766e", fg: "#99f6e4" },
  "怀旧": { bg: "#78350f", fg: "#fde68a" },
  "感恩": { bg: "#431407", fg: "#fed7aa" },
};

/**
 * 生成 OG 图片的 SVG（可直接作为 <img> 使用或转 PNG）
 */
export function generateOGImageSVG(input: ShareMediaInput): string {
  const colors = EMOTION_COLORS[input.emotionTag] || EMOTION_COLORS["治愈"];
  const title = truncate(input.shareTitle, 20);
  const content = truncate(input.contentText, 60);
  const name = `${input.name}（${input.relationship}）`;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${colors.bg}" />
      <stop offset="100%" stop-color="${adjustColor(colors.bg, -20)}" />
    </linearGradient>
    <filter id="blur">
      <feGaussianBlur in="SourceGraphic" stdDeviation="60" />
    </filter>
  </defs>
  <rect width="1200" height="630" fill="url(#bg)" />
  <circle cx="300" cy="200" r="150" fill="rgba(255,255,255,0.05)" filter="url(#blur)" />
  <circle cx="900" cy="500" r="200" fill="rgba(255,255,255,0.03)" filter="url(#blur)" />
  <text x="600" y="180" text-anchor="middle" fill="${colors.fg}" font-size="48" font-weight="bold" font-family="PingFang SC, Microsoft YaHei, sans-serif">
    ${escapeXml(title)}
  </text>
  <text x="600" y="280" text-anchor="middle" fill="rgba(255,255,255,0.9)" font-size="28" font-family="PingFang SC, Microsoft YaHei, sans-serif" font-style="italic">
    "${escapeXml(content)}"
  </text>
  <text x="600" y="400" text-anchor="middle" fill="rgba(255,255,255,0.6)" font-size="24" font-family="PingFang SC, Microsoft YaHei, sans-serif">
    —— ${escapeXml(name)}
  </text>
  <text x="600" y="560" text-anchor="middle" fill="rgba(255,255,255,0.4)" font-size="18" font-family="PingFang SC, Microsoft YaHei, sans-serif" letter-spacing="4">
    忆见 MemoryAI · 让思念有回音
  </text>
</svg>`;
}

/**
 * 生成分享页面的 HTML（用于客户端渲染视频模拟）
 */
export function generateShareVideoHTML(input: ShareMediaInput): string {
  const colors = EMOTION_COLORS[input.emotionTag] || EMOTION_COLORS["治愈"];

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      background: ${colors.bg};
      color: white;
      font-family: "PingFang SC", "Microsoft YaHei", sans-serif;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      text-align: center;
      padding: 40px 20px;
      overflow: hidden;
    }
    .particle {
      position: fixed;
      border-radius: 50%;
      background: rgba(255,255,255,0.2);
      animation: float 6s infinite ease-in-out;
    }
    @keyframes float {
      0%, 100% { transform: translateY(0) scale(1); opacity: 0.3; }
      50% { transform: translateY(-30px) scale(1.2); opacity: 0.8; }
    }
    .avatar {
      width: 100px; height: 100px; border-radius: 50%;
      border: 3px solid rgba(255,255,255,0.3);
      margin-bottom: 24px;
      display: flex; align-items: center; justify-content: center;
      font-size: 40px; background: rgba(255,255,255,0.1);
    }
    .tag {
      padding: 6px 16px; border-radius: 50px;
      background: rgba(255,255,255,0.15);
      font-size: 14px; margin-bottom: 16px;
    }
    h1 { font-size: 28px; font-weight: 700; margin-bottom: 20px; max-width: 320px; }
    .quote {
      background: rgba(255,255,255,0.95); color: #1e293b;
      border-radius: 20px; padding: 24px; max-width: 340px;
      font-size: 18px; line-height: 1.8; font-style: italic;
      margin-bottom: 28px;
    }
    .cta {
      padding: 16px 32px; border-radius: 50px;
      background: rgba(255,255,255,0.2);
      border: 1px solid rgba(255,255,255,0.3);
      color: white; font-size: 18px; text-decoration: none;
    }
    .watermark {
      position: fixed; bottom: 16px; color: rgba(255,255,255,0.4);
      font-size: 12px; letter-spacing: 2px;
    }
  </style>
</head>
<body>
  <div class="particle" style="top:20%;left:10%;width:6px;height:6px;animation-delay:0s"></div>
  <div class="particle" style="top:60%;left:80%;width:4px;height:4px;animation-delay:2s"></div>
  <div class="particle" style="top:30%;left:70%;width:8px;height:8px;animation-delay:4s"></div>
  <div class="tag">${input.emotionTag}</div>
  <div class="avatar">${input.photoUrl ? `<img src="${input.photoUrl}" style="width:100%;height:100%;object-fit:cover;border-radius:50%">` : '💫'}</div>
  <div style="color:rgba(255,255,255,0.8);font-size:18px;margin-bottom:4px">${input.name}</div>
  <div style="color:rgba(255,255,255,0.5);font-size:14px;margin-bottom:24px">${input.relationship}</div>
  <h1>${input.shareTitle}</h1>
  <div class="quote">"${input.contentText}"</div>
  <a class="cta" href="/">💫 我也想让TA对我说话</a>
  <div class="watermark">忆见 MemoryAI · 让思念有回音</div>
</body>
</html>`;
}

function truncate(text: string, maxLen: number): string {
  if (!text) return "";
  return text.length > maxLen ? text.substring(0, maxLen) + "..." : text;
}

function escapeXml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function adjustColor(hex: string, amount: number): string {
  const num = parseInt(hex.replace("#", ""), 16);
  const r = Math.min(255, Math.max(0, ((num >> 16) & 0xFF) + amount));
  const g = Math.min(255, Math.max(0, ((num >> 8) & 0xFF) + amount));
  const b = Math.min(255, Math.max(0, (num & 0xFF) + amount));
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, "0")}`;
}