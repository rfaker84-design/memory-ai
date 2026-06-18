// V7 记忆意识网络 — 类型定义

// --- 记忆节点 ---
export interface MemoryNode {
  id: string;
  name: string;
  relationship: string;
  emotion: string;        // warm | sad | peaceful | nostalgic
  presenceIntensity: number;
  photoUrl: string | null;
  lastInteraction: number;
}

// --- 关系边 ---
export interface MemoryEdge {
  from: string;
  to: string;
  relation: "family" | "emotional" | "shared_memory" | "time_overlap";
  strength: number;     // 0-1
  description: string;
}

// --- 完整图谱 ---
export interface MemoryGraph {
  nodes: MemoryNode[];
  edges: MemoryEdge[];
  generatedAt: number;
}

// --- 力导向布局节点 ---
export interface LayoutNode {
  id: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  fx?: number;  // 固定位置（被拖拽时）
  fy?: number;
  data: MemoryNode;
  selected: boolean;
}

export interface LayoutEdge {
  from: string;
  to: string;
  strength: number;
  relation: string;
}

// --- 融合结果 ---
export interface FusionResult {
  unifiedNarrative: string;
  sharedScene: {
    title: string;
    description: string;
    emotion: string;
  };
  relationshipInsight: string;
}

// --- 集体分析 ---
export interface CollectiveAnalysis {
  hotspotNode: MemoryNode | null;
  hotspotReason: string;
  emotionalDensity: number;
  recommendedAction: "visit" | "chat" | "fusion" | "reflect";
  networkHealth: number;  // 0-1
}

// --- 多人对话 ---
export interface MultiChatMessage {
  fromMemoryId: string;
  fromName: string;
  content: string;
  emotion: string;
}

export interface MultiChatSession {
  memoryIds: string[];
  messages: MultiChatMessage[];
  context: string;
}

// --- 边类型颜色映射 ---
export const EDGE_COLORS: Record<string, string> = {
  family: "rgba(255,180,120,",
  emotional: "rgba(255,140,180,",
  shared_memory: "rgba(140,200,255,",
  time_overlap: "rgba(180,220,160,",
};

// --- 节点情绪颜色 ---
export const NODE_EMOTION_COLORS: Record<string, string> = {
  warm: "#FFB86C",
  sad: "#8090B0",
  peaceful: "#AAC8E1",
  nostalgic: "#FFA564",
  default: "#8888AA",
};