/* 忆见 MemoryAI — Unified Memory Universe Config */

export type UniverseState = "SPLASH" | "UNIVERSE" | "FOCUS";

export const U = {
  bg: "#020408",
  moonRadius: 1.6,
  moonGlow: "#FFD2A6",
  moonInner: "#FFF3E8",
  planetCount: 5,
  orbitBaseRadius: 4.5,
  dustCount: 400,
  starCount: 600,
  fogNear: 8,
  fogFar: 45,
  cameraStartZ: 12,
  cameraWorldZ: 10,
  cameraFocusZ: 3,
} as const;

export const TIMING = {
  splashTitle: 0.5,
  doorGlow: 1.0,
  doorOpen: 1.6,
  pushThrough: 2.4,
  enterUniverse: 3.0,
  totalSplash: 3.5,
  focusDuration: 0.8,
} as const;

export type MemoryPlanet = {
  id: string;
  name: string;
  relationship: string;
  emotionIntensity: number;
  orbitRadius: number;
  orbitAngle: number;
  orbitSpeed: number;
  color: string;
  size: number;
};

export const DEFAULT_PLANETS: MemoryPlanet[] = [
  { id:"1",name:"父亲",relationship:"父亲",emotionIntensity:0.9,orbitRadius:5.0,orbitAngle:0,orbitSpeed:0.08,color:"#FFB37C",size:0.35 },
  { id:"2",name:"母亲",relationship:"母亲",emotionIntensity:0.85,orbitRadius:5.5,orbitAngle:1.2,orbitSpeed:0.07,color:"#FFD2A6",size:0.32 },
  { id:"3",name:"祖父",relationship:"祖父",emotionIntensity:0.7,orbitRadius:4.8,orbitAngle:2.5,orbitSpeed:0.09,color:"#FFC492",size:0.28 },
  { id:"4",name:"挚友",relationship:"挚友",emotionIntensity:0.65,orbitRadius:6.0,orbitAngle:3.8,orbitSpeed:0.065,color:"#FFE0C0",size:0.26 },
  { id:"5",name:"姐姐",relationship:"姐姐",emotionIntensity:0.8,orbitRadius:5.3,orbitAngle:5.2,orbitSpeed:0.075,color:"#FFD2A6",size:0.3 },
];