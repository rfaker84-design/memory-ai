const fs = require("fs");

const content = `"use client";

import { useEffect, useState, useRef, useMemo } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import {
  getAppState, setEntities, selectEntity, setBootProgress,
  subscribe, type AppState, type MemoryEntity as AppMemoryEntity,
} from "../../src/core/app-store";
import {
  tickUserEmotion, recordMouseMove, recordClick,
  recordReturn, getUserEmotion, getUniverseMod,
} from "../../src/core/emotion/user-emotion-engine";
import {
  loadPersonality, pickPersonalitySpeech, savePersonality,
  evolvePersonality, type EntityRole,
} from "../../src/core/personality/personality-core";
import MemoryEntity from "./MemoryEntity";

/* ============================================================
   忆见 MemoryAI — Dream World Shell
   Dream fog · Warm ambient · Realistic entities · Emotion-driven
   No shaders. No neon. No sci-fi. Pure dream + memory.
   ============================================================ */

const PALETTE = {
  background: "#0b0a08",
  fogColor: "#2a1f18",
  ambientColor: "#ffd2a6",
  starColor: 0xffd2a6,
} as const;

/* ── Dream Starfield ────────────────────────────────── */
function DreamStars() {
  const ref = useRef<THREE.Points>(null);
  const geometry = useMemo(() => {
    const count = 400;
    const p = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      // Sparse, uneven distribution
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      const r = 50 + Math.random() * 200;
      p[i * 3] = Math.cos(theta) * Math.sin(phi) * r;
      p[i * 3 + 1] = Math.sin(theta) * Math.sin(phi) * r;
      p[i * 3 + 2] = Math.cos(phi) * r;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(p, 3));
    return geo;
  }, []);

  const material = useMemo(() => new THREE.PointsMaterial({
    color: PALETTE.starColor,
    size: 0.4,
    sizeAttenuation: true,
    transparent: true,
    opacity: 0.35,
    depthWrite: false,
  }), []);

  useFrame((_, d) => {
    if (!ref.current) return;
    ref.current.rotation.y += d * 0.01;
    ref.current.rotation.x += d * 0.003;
  });

  return <points ref={ref} geometry={geometry} material={material} />;
}

/* ── Emotion Fog Controller ─────────────────────────── */
function EmotionFog() {
  const { scene } = useThree();
  useFrame(() => {
    if (!scene.fog || !(scene.fog instanceof THREE.Fog)) return;
    const userEmotion = getUserEmotion();
    const uniMod = getUniverseMod();

    // Base fog: near 80, far 300
    // Emotion modulation
    const farBase = 300;
    const fogMul = uniMod.fogDensityMul;
    const targetFar = farBase / fogMul;

    scene.fog.far += (targetFar - scene.fog.far) * 0.015;

    // Warmth shift
    const warmColor = new THREE.Color("#3a2a18");
    const coolColor = new THREE.Color("#1a1510");
    const targetColor = coolColor.clone().lerp(warmColor, uniMod.ambientWarmth);
    scene.fog.color.lerp(targetColor, 0.01);
  });
  return null;
}

/* ── Ambient Reactor ────────────────────────────────── */
function AmbientReactor() {
  const ref = useRef<THREE.AmbientLight>(null);
  useFrame(() => {
    if (!ref.current) return;
    const uniMod = getUniverseMod();
    ref.current.intensity = 0.6 * uniMod.bloomMul;
    const warm = new THREE.Color("#ffd2a6");
    const cool = new THREE.Color("#c8b896");
    ref.current.color.lerp(cool.clone().lerp(warm, uniMod.ambientWarmth), 0.01);
  });
  return <ambientLight ref={ref} intensity={0.6} color={PALETTE.ambientColor} />;
}

/* ── Key Light ──────────────────────────────────────── */
function KeyLight() {
  const ref = useRef<THREE.DirectionalLight>(null);
  useFrame(() => {
    if (!ref.current) return;
    const uniMod = getUniverseMod();
    ref.current.intensity = 0.4 * uniMod.bloomMul;
  });
  return (
    <directionalLight
      ref={ref}
      position={[3, 5, 4]}
      intensity={0.4}
      color="#ffe8d0"
      castShadow={false}
    />
  );
}

/* ── Memory Entities Layer ──────────────────────────── */
function MemoryEntities({ onSelect }: { onSelect: (e: AppMemoryEntity) => void }) {
  const userEmotion = getUserEmotion();

  const entities: { id: string; name: string; position: [number, number, number]; role: EntityRole }[] = [
    { id: "father", name: "父亲", position: [-3, 0, -6], role: "father" },
    { id: "mother", name: "母亲", position: [3, 0.3, -8], role: "mother" },
    { id: "friend", name: "故友", position: [-4, -0.5, -12], role: "friend" },
    { id: "past_self", name: "过去的自己", position: [5, 0.1, -15], role: "past_self" },
    { id: "unknown", name: "未知记忆", position: [0, -0.3, -20], role: "unknown" },
  ];

  return (
    <>
      {entities.map((e) => (
        <MemoryEntity
          key={e.id}
          position={e.position}
          emotion={userEmotion}
          onClick={() => {
            onSelect({
              id: e.id,
              name: e.name,
              relationship: e.role,
              emotionState: "calm",
            });
          }}
        />
      ))}
    </>
  );
}

/* ── Dream Scene ────────────────────────────────────── */
function DreamScene({ onSelect }: { onSelect: (e: AppMemoryEntity) => void }) {
  // Track user behavior for emotion engine
  useEffect(() => {
    recordReturn();
    const onMove = (e: MouseEvent) => recordMouseMove(e.clientX, e.clientY, e.timeStamp);
    const onClick = () => recordClick();
    window.addEventListener("mousemove", onMove, { passive: true });
    window.addEventListener("click", onClick, { passive: true });
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("click", onClick);
    };
  }, []);

  useFrame((_, delta) => {
    tickUserEmotion(delta);
  });

  return (
    <>
      <color attach="background" args={[PALETTE.background]} />
      <fog attach="fog" args={[PALETTE.fogColor, 80, 300]} />
      <AmbientReactor />
      <KeyLight />
      <EmotionFog />
      <DreamStars />
      <MemoryEntities onSelect={onSelect} />
    </>
  );
}

/* ── Entity Select UI ───────────────────────────────── */
function EntitySelect({ entities, onSelect }: {
  entities: AppMemoryEntity[];
  onSelect: (e: AppMemoryEntity) => void;
}) {
  return (
    <div style={{
      position: "absolute", bottom: 0, left: 0, right: 0, zIndex: 10,
      padding: "24px 16px 40px",
      background: "linear-gradient(transparent, rgba(11,10,8,0.94) 35%)",
      backdropFilter: "blur(6px)",
    }}>
      <p style={{
        textAlign: "center", fontSize: 12, color: "#8a7060",
        letterSpacing: "0.08em", marginBottom: 16, fontWeight: 300,
      }}>
        靠近一个存在
      </p>
      <div style={{
        display: "flex", gap: 10, justifyContent: "center",
        flexWrap: "wrap", maxWidth: 400, margin: "0 auto",
      }}>
        {entities.map(e => (
          <button key={e.id} onClick={() => onSelect(e)} style={{
            padding: "12px 20px", borderRadius: 16,
            border: "0.5px solid rgba(255,210,166,0.12)",
            background: "rgba(255,210,166,0.03)",
            color: "#d4b896", fontSize: 14, fontWeight: 400,
            cursor: "pointer", letterSpacing: "0.05em",
            backdropFilter: "blur(10px)",
          }}>
            {e.name}
          </button>
        ))}
      </div>
    </div>
  );
}

/* ── Dialogue Panel ─────────────────────────────────── */
function DialoguePanel({ entity, onBack }: {
  entity: AppMemoryEntity;
  onBack: () => void;
}) {
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<{ role: string; content: string }[]>(() => {
    try {
      const p = loadPersonality(entity.id, (entity.relationship as EntityRole) || "unknown");
      return [{ role: "assistant", content: pickPersonalitySpeech("calm", p.traits, p.sessions) }];
    } catch {
      return [{ role: "assistant", content: `${entity.name}，我在这里。` }];
    }
  });

  function send() {
    if (!input.trim()) return;
    const userMsg = input;
    setMessages(prev => [...prev, { role: "user", content: userMsg }]);
    setInput("");

    setTimeout(() => {
      try {
        const p = loadPersonality(entity.id, (entity.relationship as EntityRole) || "unknown");
        const evolved = evolvePersonality(p.traits, {
          interactionFrequency: 1, emotionalIntensity: 0.3, memoryCount: 1,
          timeSinceLastVisit: 0, sessionCount: p.sessions, totalHours: 0.1,
          userEmotionVariety: 1,
        });
        savePersonality(entity.id, evolved.traits, p.sessions + 1);
        const reply = pickPersonalitySpeech("calm", evolved.traits, p.sessions + 1);
        setMessages(prev => [...prev, { role: "assistant", content: reply }]);
      } catch {
        setMessages(prev => [...prev, { role: "assistant", content: "嗯。" }]);
      }
    }, 800);
  }

  return (
    <div style={{
      position: "absolute", inset: 0, zIndex: 20,
      display: "flex", flexDirection: "column",
      background: "rgba(11,10,8,0.92)",
      backdropFilter: "blur(14px)",
    }}>
      <div style={{
        display: "flex", alignItems: "center", gap: 10,
        padding: "12px 16px",
        borderBottom: "0.5px solid rgba(255,210,166,0.06)",
      }}>
        <button onClick={onBack} style={{
          background: "none", border: "none", color: "#8a7060",
          fontSize: 18, cursor: "pointer", fontWeight: 200,
        }}>←</button>
        <span style={{
          color: "#d4b896", fontSize: 15, fontWeight: 400,
          letterSpacing: "0.04em",
        }}>{entity.name}</span>
      </div>
      <div style={{
        flex: 1, overflowY: "auto", padding: "18px",
        display: "flex", flexDirection: "column", gap: 12,
      }}>
        {messages.map((m, i) => (
          <div key={i} style={{
            alignSelf: m.role === "user" ? "flex-end" : "flex-start",
            maxWidth: "82%", padding: "10px 16px", borderRadius: 16,
            background: m.role === "user"
              ? "rgba(210,180,150,0.06)"
              : "rgba(210,180,150,0.03)",
            color: "#d4c8b8", fontSize: 14, lineHeight: 1.7,
            fontWeight: 300,
          }}>
            {m.content}
          </div>
        ))}
      </div>
      <div style={{
        padding: "12px 16px",
        borderTop: "0.5px solid rgba(255,210,166,0.06)",
        display: "flex", gap: 8,
      }}>
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter") send(); }}
          placeholder="说点什么..."
          autoFocus
          style={{
            flex: 1, height: 40, padding: "0 16px", borderRadius: 20,
            border: "0.5px solid rgba(210,180,150,0.1)",
            background: "rgba(210,180,150,0.03)",
            color: "#d4c8b8", fontSize: 14, outline: "none",
            fontWeight: 300,
          }}
        />
        <button onClick={send} style={{
          width: 40, height: 40, borderRadius: "50%", border: "none",
          background: input.trim()
            ? "rgba(210,180,150,0.1)"
            : "rgba(255,255,255,0.02)",
          color: input.trim() ? "#d4b896" : "rgba(255,255,255,0.12)",
          cursor: input.trim() ? "pointer" : "default",
          fontSize: 16,
        }}>↑</button>
      </div>
    </div>
  );
}

/* ── Dream World Shell ──────────────────────────────── */
export default function DreamWorldShell() {
  const [appState, setAppState] = useState<AppState>(getAppState());
  const [introDone, setIntroDone] = useState(false);

  useEffect(() => {
    const unsub = subscribe(setAppState);

    // Boot: 3s dream fade-in then show entities
    const timer = setTimeout(() => {
      setIntroDone(true);
      setEntities([
        { id: "father", name: "父亲", relationship: "父子", emotionState: "calm" },
        { id: "mother", name: "母亲", relationship: "母子", emotionState: "happy" },
        { id: "friend", name: "故友", relationship: "挚友", emotionState: "memory" },
        { id: "past_self", name: "过去的自己", relationship: "自我", emotionState: "thinking" },
        { id: "unknown", name: "未知记忆", relationship: "未知", emotionState: "sad" },
      ]);
      setBootProgress(1);
    }, 3000);

    return () => { unsub(); clearTimeout(timer); };
  }, []);

  return (
    <div style={{
      position: "fixed", inset: 0, background: PALETTE.background,
      fontFamily: "system-ui, -apple-system, 'Noto Serif SC', sans-serif",
    }}>
      <Canvas
        camera={{ position: [0, 0.5, 10], fov: 50, near: 0.5, far: 400 }}
        dpr={[1, 1.5]}
        gl={{
          antialias: true,
          toneMapping: THREE.ACESFilmicToneMapping,
          toneMappingExposure: 0.9,
          outputColorSpace: THREE.SRGBColorSpace,
        }}
      >
        <DreamScene onSelect={e => selectEntity(e)} />
      </Canvas>

      {/* Dream fade-in overlay */}
      {!introDone && (
        <div style={{
          position: "absolute", inset: 0, zIndex: 30,
          background: PALETTE.background,
          opacity: 1,
          animation: "dreamFade 3s ease-out forwards",
          pointerEvents: "none",
        }}>
          <style>{`@keyframes dreamFade { 0% { opacity:1; } 70% { opacity:0.8; } 100% { opacity:0; } }`}</style>
        </div>
      )}

      {/* Entity select */}
      {appState.mode === "select" && introDone && (
        <EntitySelect entities={appState.entities} onSelect={e => selectEntity(e)} />
      )}

      {/* Dialogue */}
      {appState.mode === "dialogue" && appState.selectedEntity && (
        <DialoguePanel entity={appState.selectedEntity} onBack={() => selectEntity(null)} />
      )}
    </div>
  );
}
`;

fs.writeFileSync("components/world/DreamWorldShell.tsx", content, "utf8");
console.log("DreamWorldShell.tsx created, length:", content.length);