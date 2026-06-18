/* 忆见 MemoryAI — Memory World Config */

export const WORLD = {
  bg: "#05070A",
  fogNear: 8,
  fogFar: 40,
  islandCount: 8,
  islandRadius: 12,   // spread radius
  islandYBase: 0,
  orbitSpeed: 0.08,
} as const;

export type MemoryEntity = {
  id: string;
  name: string;
  relationship: string;
  emotionIntensity: number; // 0..1
  orbitRadius: number;
  orbitAngle: number;
  color: string;
};

export const DEFAULT_MEMORIES: MemoryEntity[] = [
  { id: "1", name: "父亲", relationship: "父亲", emotionIntensity: 0.9, orbitRadius: 10, orbitAngle: 0, color: "#FFB37C" },
  { id: "2", name: "母亲", relationship: "母亲", emotionIntensity: 0.85, orbitRadius: 11, orbitAngle: 1.2, color: "#FFD2A6" },
  { id: "3", name: "祖父", relationship: "祖父", emotionIntensity: 0.7, orbitRadius: 9.5, orbitAngle: 2.5, color: "#FFC492" },
  { id: "4", name: "挚友", relationship: "挚友", emotionIntensity: 0.65, orbitRadius: 12.5, orbitAngle: 3.8, color: "#FFE0C0" },
  { id: "5", name: "姐姐", relationship: "姐姐", emotionIntensity: 0.8, orbitRadius: 10.5, orbitAngle: 5.0, color: "#FFD2A6" },
];

export const RELATIONS: [string, string, number][] = [
  ["1", "2", 0.9],
  ["1", "3", 0.7],
  ["1", "5", 0.8],
  ["2", "5", 0.75],
  ["3", "4", 0.5],
  ["2", "4", 0.4],
];