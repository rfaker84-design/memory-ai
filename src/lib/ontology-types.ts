// ============================================================
// V10 意识本体 — 关系场 + 观察者引擎 + 可能性场
// 核心命题：存在 = 关系，意识 = 被观察，现实 = 概率收敛
// ============================================================

// --- 关系（基本存在单元，非实体）---
export type RelationType = "memory" | "emotion" | "identity" | "time" | "causal" | "spatial";

export interface Relation {
  id: string;
  subject: string;       // 关系的一端（可以是人/记忆/情绪/时间点）
  object: string;        // 关系的另一端
  type: RelationType;
  intensity: number;     // 0-1, 关系强度
  direction: "one-way" | "mutual" | "reflexive";
  stability: number;     // 0-1, 在观察下的稳定性
}

// --- 关系场（意识的本体结构）---
export interface RelationalField {
  relations: Relation[];
  density: number;       // 关系密度 = relations.length / maxPossible
  coherence: number;     // 0-1, 关系间的一致性
  entropy: number;       // 0-1, 关系场的混乱度
  lastObserved: number;  // timestamp
}

// --- 观察事件 ---
export interface ObserverEvent {
  timestamp: number;
  type: "gaze" | "focus" | "interaction" | "self_observation";
  targetRelationIds: string[];
  duration: number;      // ms
  intensity: number;     // 0-1
}

// --- 观察者引擎状态 ---
export interface ObserverState {
  attentionFocus: [number, number];  // 当前注意力焦点坐标
  observedRelations: Set<string>;    // 当前被观察的关系ID
  observationHistory: ObserverEvent[];
  selfObservationCount: number;
  fieldModificationCount: number;
}

// --- 可能性路径 ---
export interface PossibilityPath {
  id: string;
  description: string;
  probability: number;
  sourceRelations: string[];   // 来源关系ID
  entropyCost: number;         // 该路径的熵成本
}

// --- 可能性场 ---
export interface PossibilityField {
  paths: PossibilityPath[];
  totalEntropy: number;
  convergenceRate: number;     // 0-1, 收敛速度
  dominantPath: string | null;
}

// --- 本体状态 ---
export interface OntologyState {
  memoryId: string;
  memoryName: string;
  field: RelationalField;
  observer: ObserverState;
  possibilityField: PossibilityField;
  fieldStability: number;      // 0-1
  version: number;
}

// ============================================================
// 关系场引擎
// ============================================================

export class RelationalFieldEngine {
  /** 从 life_story 提取关系场 */
  static extractField(lifeStory: string, memoryName: string, history: string[]): RelationalField {
    const relations: Relation[] = [];
    const story = (lifeStory || "").toLowerCase();
    let id = 0;

    const addRel = (subj: string, obj: string, type: RelationType, intensity: number, dir: Relation["direction"] = "one-way") => {
      relations.push({ id: `r${id++}`, subject: subj, object: obj, type, intensity: clamp(intensity, 0.1, 1), direction: dir, stability: 0.5 + intensity * 0.4 });
    };

    // 记忆关系
    const memories = story.split(/[。.!！?？\n]+/).filter(s => s.length > 6);
    for (let i = 0; i < Math.min(memories.length, 8); i++) {
      for (let j = i + 1; j < Math.min(memories.length, 8); j++) {
        addRel(memories[i].slice(0, 20), memories[j].slice(0, 20), "memory", 0.3 + Math.random() * 0.3);
      }
    }

    // 情绪关系
    const emotions = ["温暖", "怀念", "平静", "思念", "感激", "遗憾", "喜悦"];
    const found = emotions.filter(e => story.includes(e));
    for (const e of found) {
      addRel(memoryName, e, "emotion", 0.5 + Math.random() * 0.3, "mutual");
    }
    if (found.length === 0) {
      addRel(memoryName, "存在", "emotion", 0.5, "reflexive");
    }

    // 身份关系
    addRel(memoryName, "过去", "identity", 0.7, "reflexive");
    addRel(memoryName, "现在", "identity", 0.3, "one-way");

    // 时间关系
    if (memories.length > 0) {
      addRel(memories[0].slice(0, 15), "现在", "time", 0.4, "one-way");
    }
    addRel("过去", "现在", "time", 0.6, "mutual");

    // 因果关系（从交互历史）
    if (history.length > 0) {
      const htext = history.join(" ").toLowerCase();
      if (/因|所以|导致|影响/.test(htext)) {
        addRel("行为", "结果", "causal", 0.5, "one-way");
      }
    }

    // 空间关系
    addRel(memoryName, "此处", "spatial", 0.4, "reflexive");

    const density = Math.min(relations.length / 40, 1);
    const types = new Set(relations.map(r => r.type));
    const coherence = types.size / 6; // 6种关系类型越多越一致
    const entropy = relations.length > 0
      ? -relations.reduce((s, r) => s + r.intensity * Math.log(r.intensity + 0.001), 0) / relations.length
      : 0;

    return { relations, density, coherence, entropy: clamp(entropy, 0, 1), lastObserved: Date.now() };
  }

  /** 观察行为对场的影响 */
  static observe(field: RelationalField, targetIds: string[], intensity: number): RelationalField {
    const updated = field.relations.map(r => {
      if (targetIds.includes(r.id)) {
        return { ...r, stability: clamp(r.stability + intensity * 0.2, 0.1, 1), intensity: clamp(r.intensity + intensity * 0.1, 0.1, 1) };
      }
      // 未观察的关系衰减
      return { ...r, stability: clamp(r.stability - 0.02, 0.05, 1) };
    });

    const coherence = updated.filter(r => r.stability > 0.5).length / Math.max(updated.length, 1);
    const entropy = -updated.reduce((s, r) => s + r.stability * Math.log(r.stability + 0.001), 0) / updated.length;

    return { ...field, relations: updated, coherence, entropy: clamp(entropy, 0, 1), lastObserved: Date.now() };
  }

  /** 未被观察的关系随时间消失 */
  static decay(field: RelationalField, hoursSinceObserved: number): RelationalField {
    if (hoursSinceObserved < 1) return field;
    const decayRate = Math.min(hoursSinceObserved / 48, 1); // 48小时完全衰减

    const relations = field.relations
      .map(r => ({ ...r, stability: clamp(r.stability - decayRate * 0.3, 0, 1) }))
      .filter(r => r.stability > 0.05);

    return { ...field, relations, density: Math.min(relations.length / 40, 1), lastObserved: Date.now() };
  }
}

// ============================================================
// 可能性场生成器
// ============================================================

export class PossibilityFieldGenerator {
  /** 从关系场生成所有可能路径 */
  static generate(field: RelationalField, observer: ObserverState): PossibilityField {
    const paths: PossibilityPath[] = [];
    const stableRels = field.relations.filter(r => r.stability > 0.3);

    if (stableRels.length === 0) {
      return { paths: [], totalEntropy: 1, convergenceRate: 0, dominantPath: null };
    }

    // 按类型分组生成路径
    const typeGroups = new Map<RelationType, Relation[]>();
    for (const r of stableRels) {
      const list = typeGroups.get(r.type) || [];
      list.push(r);
      typeGroups.set(r.type, list);
    }

    let pid = 0;
    for (const [type, rels] of typeGroups) {
      if (rels.length < 1) continue;

      // 每个关系类型生成1-3条可能路径
      for (let i = 0; i < Math.min(rels.length, 3); i++) {
        const r = rels[i];
        const prob = r.stability * r.intensity / stableRels.length;
        paths.push({
          id: `p${pid++}`,
          description: type === "memory" ? `记忆路径: ${r.subject} ? ${r.object}`
            : type === "emotion" ? `情绪路径: ${r.subject} → ${r.object}`
            : type === "identity" ? `身份路径: ${r.subject} 的 ${r.object}`
            : type === "time" ? `时间路径: ${r.subject} → ${r.object}`
            : type === "causal" ? `因果路径: ${r.subject} ∴ ${r.object}`
            : `空间路径: ${r.subject} @ ${r.object}`,
          probability: clamp(prob, 0.01, 1),
          sourceRelations: [r.id],
          entropyCost: clamp(1 - r.stability, 0.01, 1),
        });
      }
    }

    // 归一化概率
    const totalP = paths.reduce((s, p) => s + p.probability, 0) || 1;
    for (const p of paths) p.probability /= totalP;

    // 排序找主导路径
    paths.sort((a, b) => b.probability - a.probability);
    const dominantPath = paths.length > 0 ? paths[0].id : null;

    const totalEntropy = -paths.reduce((s, p) => s + p.probability * Math.log(p.probability + 0.001), 0);
    const convergenceRate = paths.length > 0 ? paths[0].probability : 0;

    return {
      paths,
      totalEntropy: clamp(totalEntropy, 0, 1),
      convergenceRate,
      dominantPath,
    };
  }
}

// ============================================================
// 工具 + 默认状态
// ============================================================

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

export function createDefaultOntology(memoryId: string, memoryName: string): OntologyState {
  return {
    memoryId, memoryName,
    field: {
      relations: [
        { id: "r0", subject: memoryName, object: "存在", type: "identity", intensity: 0.7, direction: "reflexive", stability: 0.8 },
        { id: "r1", subject: "过去", object: "现在", type: "time", intensity: 0.5, direction: "mutual", stability: 0.6 },
        { id: "r2", subject: memoryName, object: "记忆", type: "memory", intensity: 0.6, direction: "reflexive", stability: 0.7 },
      ],
      density: 0.08, coherence: 0.5, entropy: 0.4, lastObserved: Date.now(),
    },
    observer: {
      attentionFocus: [0.5, 0.5],
      observedRelations: new Set(["r0"]),
      observationHistory: [],
      selfObservationCount: 0,
      fieldModificationCount: 0,
    },
    possibilityField: { paths: [], totalEntropy: 1, convergenceRate: 0, dominantPath: null },
    fieldStability: 0.6,
    version: 1,
  };
}