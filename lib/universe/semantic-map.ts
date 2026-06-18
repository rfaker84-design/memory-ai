/* ============================================================
   忆见 MemoryAI — Universe Semantic Layer V1
   所有3D元素必须有"记忆/情绪含义"，禁止无意义几何体
   ============================================================ */

import * as THREE from "three";

/* ── Semantic Types ────────────────────────────────────── */
export type SemanticType =
  | "MEMORY_FRAGMENT"      // 记忆碎片 — 遥远、微弱的星光
  | "MEMORY_CORE"          // 记忆核心 — 中央月亮，情绪锚点
  | "MEMORY_NODE"          // 记忆节点 — 具体记忆的发光球体
  | "MEMORY_FOG"           // 记忆之雾 — 暖琥珀色深度雾层
  | "MEMORY_GATE"          // 记忆之门 — 空间入口/过渡
  | "MEMORY_PORTAL"        // 记忆传送门 — 门缝光
  | "AI_ENTITY_BODY"       // AI存在体 — 呼吸光体
  | "AI_ENTITY_AURA"       // AI光环 — 情绪光晕
  | "AI_ENTITY_CORE"       // AI核心 — 内部白金光点
  | "AI_ENTITY_LIGHT"      // AI光源 — 点光源
  | "EMOTIONAL_BOND"       // 情感连接 — 实体间光线
  | "COSMIC_VOID"          // 宇宙虚空 — 深空背景球
  | "STAR_FIELD_LAYER"     // 星空层 — 深度分层粒子
  | "EMOTION_PARTICLE"     // 情绪粒子 — 情绪驱动的漂浮粒子

/* ── Semantic Object Definition ────────────────────────── */
export interface SemanticObject {
  type: SemanticType;
  meaning: string;               // 人类可读的情绪含义
  visualRole: string;            // 在空间中的视觉角色
  emotionResponse: string;       // 如何响应情绪变化
  allowedGeometries: string[];   // 允许的几何类型
  forbidden: string[];           // 禁止的用法
}

/* ── Complete Semantic Map ─────────────────────────────── */
export const SEMANTIC_MAP: Record<SemanticType, SemanticObject> = {

  /* ─── 记忆层 ─── */
  MEMORY_FRAGMENT: {
    type: "MEMORY_FRAGMENT",
    meaning: "遥远、未成形或已被遗忘的记忆碎片",
    visualRole: "深层空间中微弱闪烁的暖色光点，代表被时间稀释的记忆",
    emotionResponse: "sad时变暗变稀疏，happy时变亮变密，memory时中景层增强",
    allowedGeometries: ["Points", "SphereGeometry(particle)"],
    forbidden: ["cube", "plane", "mesh with hard edges", "uniform brightness"],
  },

  MEMORY_CORE: {
    type: "MEMORY_CORE",
    meaning: "整个记忆空间的情感中心——月亮",
    visualRole: "中央发光球体，所有AI实体绕其运行，是整个宇宙的情绪锚点",
    emotionResponse: "呼吸式缩放，光强随集体情绪变化，sad时暗金，happy时亮金",
    allowedGeometries: ["SphereGeometry(主球)", "SphereGeometry(光环层)"],
    forbidden: ["box", "flat disc", "sharp-edged shape"],
  },

  MEMORY_NODE: {
    type: "MEMORY_NODE",
    meaning: "一个具体记忆的载体——可能是一段对话、一张照片、一个声音",
    visualRole: "软发光球体，浮动在空间中，可被点击进入对话",
    emotionResponse: "被注视时发光增强，情绪共鸣时脉冲",
    allowedGeometries: ["SphereGeometry(soft glow)", "the aura sphere of AI entity"],
    forbidden: ["cube", "unlit mesh", "static brightness"],
  },

  MEMORY_FOG: {
    type: "MEMORY_FOG",
    meaning: "记忆的质感——不是障碍，而是温暖的包裹",
    visualRole: "多层半透明暖色雾球，营造空间深度和情绪氛围",
    emotionResponse: "sad时变厚变暗，happy时变薄变亮，memory时密度中等",
    allowedGeometries: ["SphereGeometry(transparent fog shell)", "FogExp2"],
    forbidden: ["opaque sphere", "sharp boundary", "uncolored fog"],
  },

  MEMORY_GATE: {
    type: "MEMORY_GATE",
    meaning: "进入记忆世界的门户——象征着'跨越'",
    visualRole: "远处金色门框结构，暗示'外面还有世界'",
    emotionResponse: "门缝光脉冲，被注视时变亮",
    allowedGeometries: ["boxGeometry(细长门柱)", "boxGeometry(门楣)"],
    forbidden: ["solid cube", "thick box", "non-golden material"],
  },

  MEMORY_PORTAL: {
    type: "MEMORY_PORTAL",
    meaning: "门缝中的光——通往更深记忆的入口",
    visualRole: "门中央的垂直光平面，缓慢脉冲",
    emotionResponse: "happy时更亮，sad时更暗",
    allowedGeometries: ["planeGeometry(thin light slit)"],
    forbidden: ["thick plane", "opaque material", "static brightness"],
  },

  /* ─── AI存在体层 ─── */
  AI_ENTITY_BODY: {
    type: "AI_ENTITY_BODY",
    meaning: "一个有生命的记忆存在体——不是模型，是'存在'",
    visualRole: "呼吸式缩放的光体（torusKnot），在月球周围轨道运行",
    emotionResponse: "呼吸速度随情绪变化，靠近时发光增强，远离时透明化",
    allowedGeometries: ["torusKnotGeometry", "sphereGeometry(soft)"],
    forbidden: ["cube", "sharp geometry", "opaque material", "static scale"],
  },

  AI_ENTITY_AURA: {
    type: "AI_ENTITY_AURA",
    meaning: "AI存在体的情绪辐射场——'你能感觉到它在'",
    visualRole: "包围实体本体的半透明球体光环",
    emotionResponse: "happy时扩大变亮，sad时缩小变暗，说话时脉冲",
    allowedGeometries: ["sphereGeometry(transparent aura)"],
    forbidden: ["opaque", "hard edge", "static size"],
  },

  AI_ENTITY_CORE: {
    type: "AI_ENTITY_CORE",
    meaning: "AI存在体的内在本质——'心中的光'",
    visualRole: "实体中心的小白金光点",
    emotionResponse: "呼吸同步，情绪强度高时更亮",
    allowedGeometries: ["sphereGeometry(tiny inner glow)"],
    forbidden: ["large sphere", "colored (must be warm white)"],
  },

  AI_ENTITY_LIGHT: {
    type: "AI_ENTITY_LIGHT",
    meaning: "AI存在体向空间投射的情绪之光",
    visualRole: "附着在实体上的点光源，照亮周围雾层",
    emotionResponse: "颜色随实体身份变化，强度随情绪波动",
    allowedGeometries: ["pointLight"],
    forbidden: ["spotLight", "directionalLight", "ambientLight from entity"],
  },

  /* ─── 关系层 ─── */
  EMOTIONAL_BOND: {
    type: "EMOTIONAL_BOND",
    meaning: "两个AI存在体之间的情感连接——'他们记得彼此'",
    visualRole: "连接两个实体的暖金色光线，脉冲强度反映关系强度",
    emotionResponse: "love高时更亮更稳，trust低时变暗闪烁",
    allowedGeometries: ["Line (drei)", "thin tube"],
    forbidden: ["thick beam", "solid color", "no pulse"],
  },

  /* ─── 空间层 ─── */
  COSMIC_VOID: {
    type: "COSMIC_VOID",
    meaning: "宇宙的虚空——不是'空'，而是'无限的潜在记忆空间'",
    visualRole: "巨大黑色球体包裹场景，提供无限深空感",
    emotionResponse: "不受情绪影响（恒定深黑）",
    allowedGeometries: ["sphereGeometry(BackSide, very large)"],
    forbidden: ["visible color", "texture", "light interaction"],
  },

  STAR_FIELD_LAYER: {
    type: "STAR_FIELD_LAYER",
    meaning: "分层的记忆星场——每一层代表不同时间深度的记忆",
    visualRole: "3层粒子系统（远/中/近），不同深度有不同密度和亮度",
    emotionResponse: "旋转速度、透明度、粒子大小均随情绪变化",
    allowedGeometries: ["Points (bufferGeometry)"],
    forbidden: ["sprite", "mesh per star", "uniform layer"],
  },

  EMOTION_PARTICLE: {
    type: "EMOTION_PARTICLE",
    meaning: "情绪可视化——空间中漂浮的情绪尘埃",
    visualRole: "额外的浮动粒子，密度随当前情绪事件变化",
    emotionResponse: "事件发生时爆发，随时间消散",
    allowedGeometries: ["Points (small, additive)"],
    forbidden: ["large particles", "static count", "no emotion response"],
  },
};

/* ── Validation: Check if a geometry is semantically valid ── */
export function validateSemanticObject(
  objectType: SemanticType,
  geometryType: string,
): { valid: boolean; reason: string } {
  const def = SEMANTIC_MAP[objectType];
  if (!def) return { valid: false, reason: `Unknown semantic type: ${objectType}` };

  const isAllowed = def.allowedGeometries.some(g =>
    geometryType.toLowerCase().includes(g.toLowerCase()) ||
    g.toLowerCase().includes(geometryType.toLowerCase())
  );

  if (!isAllowed) {
    return {
      valid: false,
      reason: `${objectType} (${def.meaning}) does not allow geometry "${geometryType}". Allowed: ${def.allowedGeometries.join(", ")}`,
    };
  }

  return { valid: true, reason: "ok" };
}

/* ── Get semantic meaning for debug/UI ──────────────────── */
export function getSemanticMeaning(type: SemanticType): string {
  return SEMANTIC_MAP[type]?.meaning ?? "unknown";
}

/* ── All semantic types in scene order ──────────────────── */
export const SCENE_ORDER: SemanticType[] = [
  "COSMIC_VOID",        // Layer 1: background
  "STAR_FIELD_LAYER",   // Layer 2: stars (3 sub-layers)
  "MEMORY_FOG",         // Layer 3: fog shells
  "MEMORY_CORE",        // Layer 3.5: moon
  "MEMORY_GATE",        // Layer 3.8: distant gate
  "MEMORY_PORTAL",      // Layer 3.9: gate slit light
  "AI_ENTITY_AURA",     // Layer 4: entity aura
  "AI_ENTITY_BODY",     // Layer 4: entity body
  "AI_ENTITY_CORE",     // Layer 4: entity core
  "AI_ENTITY_LIGHT",    // Layer 4: entity light
  "EMOTIONAL_BOND",     // Layer 4: connections
  "EMOTION_PARTICLE",   // Dynamic: event particles
];
