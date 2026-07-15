"use client";

import { useEffect, useState, useRef, useMemo } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { EffectComposer, Bloom } from "@react-three/postprocessing";
import * as THREE from "three";
import {
  getAppState, setEntities, selectEntity, setBootProgress,
  subscribe, type AppState, type MemoryEntity as AppMemoryEntity,
} from "../../src/core/app-store";
import MemoryEntity from "./MemoryEntity";
import type { EmotionState } from "../../lib/visual-ai-controller";
import {
  tickUserEmotion, recordMouseMove, recordClick,
  getUserEmotion, type UserEmotion,
} from "../../src/core/emotion/user-emotion-engine";
import {
  getTabState, setTabMode, subscribeTab, type TabMode,
} from "../../src/core/tab/tab-store";
import BottomTab from "../ui/BottomTab";
import HomeV3 from "./HomeV3";

import {
  loadPersonality, savePersonality, transitionToTab,
  evolvePersonality, pickTabSpeech, TAB_PERSONAS,
  type EntityPersonality,
} from "../../src/core/personality/entity-personality-core";
import MemorySoulBody from "../memory/MemorySoulBody";

/* ============================================================
   蹇嗚 MemoryAI 鈥?Single Dream Space / Four Tab States
   home 路 chat 路 memory 路 profile 鈥?all in one canvas
   ============================================================ */

const DREAM = {
  bg: "#0B0A08",
  fogColor: "#2a1f18",
  fogNear: 80,
  fogFar: 300,
  ambientColor: "#ffd2a6",
  ambientIntensity: 0.6,
  starColor: 0xffd2a6,
  starSize: 1.0,
  starOpacity: 0.7,
  starCount: 2000,
};

const ENTITY_POSITIONS: Record<string, [number, number, number]> = {};

const runtime = {
  time: 0,
  currentEmotion: "calm" as UserEmotion,
  lightTargetIntensity: 0.6,
  lightCurrentIntensity: 0.6,
  starOpacityTarget: 0.7,
  starOpacityCurrent: 0.7,
  entityZOffset: 0,
  entityZCurrent: 0,
};

function lerp(a: number, b: number, t: number) { return a + (b - a) * t; }

/* 鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲
   DREAM STARS
   鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲 */

/* 鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺?   /* 鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺?   REAL STAR SHADER 鈥?per-vertex twinkle, warm color, glow
   鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺?*/

const STAR_VERTEX = /* glsl */ `
  in float aSize;
  in float aPhase;
  in float aSpeed;
  out float vBrightness;
  out float vSize;
  uniform float uTime;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    // Per-star twinkle: multi-sine with unique phase + speed
    float twinkle = sin(uTime * aSpeed + aPhase) * 0.5 + 0.5;
    twinkle = twinkle * twinkle; // sharpen the pulse
    float wave = sin(uTime * aSpeed * 0.3 + aPhase * 1.7) * 0.3;
    vBrightness = 0.35 + twinkle * 0.55 + wave * 0.1;
    gl_PointSize = aSize * (300.0 / -mv.z) * (0.7 + twinkle * 0.3);
    gl_Position = projectionMatrix * mv;
    vSize = aSize;
  }
`;

const STAR_FRAGMENT = /* glsl */ `
  in float vBrightness;
  in float vSize;
  void main() {
    float d = length(gl_PointCoord - 0.5) * 2.0;
    // Soft radial falloff
    float alpha = 1.0 - smoothstep(0.0, 1.0, d);
    alpha = pow(alpha, 1.5);
    // Warm color: slight amber tint
    vec3 color = mix(vec3(1.0, 0.95, 0.85), vec3(1.0, 1.0, 0.95), vBrightness);
    float a = alpha * vBrightness;
    if (a < 0.02) discard;
    gl_FragColor = vec4(color, a);
  }
`;

function ShaderStars() {
  const ref = useRef<THREE.Points>(null);
  const matRef = useRef<THREE.ShaderMaterial>(null);

  const { geometry, uniforms } = useMemo(() => {
    const count = 6000;
    const positions = new Float32Array(count * 3);
    const sizes = new Float32Array(count);
    const phases = new Float32Array(count);
    const speeds = new Float32Array(count);

    for (let i = 0; i < count; i++) {
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      const r = 180 + Math.pow(Math.random(), 0.6) * 320;
      positions[i * 3] = Math.cos(theta) * Math.sin(phi) * r;
      positions[i * 3 + 1] = Math.sin(theta) * Math.sin(phi) * r * 0.5;
      positions[i * 3 + 2] = Math.cos(phi) * r;
      sizes[i] = 0.3 + Math.random() * 2.0;
      phases[i] = Math.random() * Math.PI * 2;
      speeds[i] = 1.5 + Math.random() * 4.0;
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geo.setAttribute("aSize", new THREE.BufferAttribute(sizes, 1));
    geo.setAttribute("aPhase", new THREE.BufferAttribute(phases, 1));
    geo.setAttribute("aSpeed", new THREE.BufferAttribute(speeds, 1));

    const uniforms = { uTime: { value: 0 } };
    return { geometry: geo, uniforms };
  }, []);

  useFrame((_, delta) => {
    if (!ref.current) return;
    ref.current.rotation.y += delta * 0.002;
    uniforms.uTime.value += delta;
  });

  return (
    <points ref={ref} geometry={geometry} frustumCulled={false}>
      <shaderMaterial
        ref={matRef}
        vertexShader={STAR_VERTEX}
        fragmentShader={STAR_FRAGMENT}
        uniforms={uniforms}
        transparent
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </points>
  );
}

function DreamStars() {
  return <ShaderStars />;
}

/* 鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺?   TAB 鈫?EMOTION MAPPING
   鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲 */

const TAB_EMOTION: Record<TabMode, { light: number; stars: number; entityZ: number; emotion: EmotionState }> = {
  home:    { light: 0.6,  stars: 0.7,  entityZ: 0,   emotion: "calm" },
  chat:    { light: 0.8,  stars: 0.85, entityZ: 15,  emotion: "happy" },
  memory:  { light: 0.55, stars: 0.65, entityZ: -10, emotion: "memory" },
  profile: { light: 0.45, stars: 0.5,  entityZ: -25, emotion: "calm" },
};

/* 鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲
   DREAM SCENE 鈥?single canvas, always present
   鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲 */

function DreamScene({ entities, onEntityClick, tabMode, personalities }: {
  entities: AppMemoryEntity[];
  onEntityClick: (e: AppMemoryEntity) => void;
  tabMode: TabMode;
  personalities: Record<string, EntityPersonality>;
}) {
  useFrame((_, delta) => {
    runtime.time += delta;

    // Tab-driven target parameters
    const cfg = TAB_EMOTION[tabMode];
    runtime.lightTargetIntensity = cfg.light;
    runtime.starOpacityTarget = cfg.stars;
    runtime.entityZOffset = cfg.entityZ;

    // Smooth interpolation
    runtime.lightCurrentIntensity = lerp(runtime.lightCurrentIntensity, runtime.lightTargetIntensity, delta * 0.5);
    runtime.starOpacityCurrent = lerp(runtime.starOpacityCurrent, runtime.starOpacityTarget, delta * 0.5);
    runtime.entityZCurrent = lerp(runtime.entityZCurrent, runtime.entityZOffset, delta * 0.3);

    // User emotion override (subtle, adds life)
    const userEmotion = getUserEmotion();
    if (userEmotion === "warm") {
      runtime.lightCurrentIntensity += 0.03;
    } else if (userEmotion === "lonely") {
      runtime.starOpacityCurrent -= 0.02;
    }
  });

  return (
    <>
      <color attach="background" args={[DREAM.bg]} />
      <fog attach="fog" args={[DREAM.fogColor, DREAM.fogNear, DREAM.fogFar]} />
      <ambientLight color={DREAM.ambientColor} intensity={DREAM.ambientIntensity} />
      <DreamStars />

            {/* Entities removed */}

      <CameraDrift tabMode={tabMode} />
      {/* Soul silhouette moved to DOM layer */}
      <EffectComposer>
        <Bloom luminanceThreshold={0.2} luminanceSmoothing={0.9} intensity={1.2} radius={0.5} mipmapBlur />
      </EffectComposer>
    </>
  );
}

function CameraDrift({ tabMode }: { tabMode: TabMode }) {
  useFrame(({ camera }, delta) => {
    const t = runtime.time;
    const speed = tabMode === "chat" ? 0.15 : tabMode === "memory" ? 0.08 : 0.12;
    camera.position.x += Math.sin(t * speed) * delta * 0.3;
    camera.position.y += Math.cos(t * speed * 0.8) * delta * 0.2;
    // Chat mode: look slightly closer
    const lookZ = tabMode === "chat" ? -60 : tabMode === "profile" ? -100 : -80;
    camera.lookAt(0, 0, lookZ);
  });
  return null;
}

/* 鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲
   HOME OVERLAY 鈥?warm memory welcome
   鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲 */

function HomeOverlay({ onLoginSuccess }: { onLoginSuccess: () => void }) {
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [step, setStep] = useState<"phone" | "code">("phone");
  const [sending, setSending] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const [challengeId, setChallengeId] = useState("");

  const sendCode = async () => {
    if (!phone || sending) return;
    setSending(true);
    try {
      const res = await fetch("/api/auth/send-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ phone }),
      });
      const data = await res.json();
      if (res.status === 202 && data.accepted && data.challengeId) {
        setChallengeId(data.challengeId);
        setSending(false);
        setStep('code');
        setCountdown(60);
      } else {
        setSending(false);
        alert(data.error || "发送失败");
      }
    } catch {
      setSending(false);
      alert("网络错误，请重试");
    }
  };

  useEffect(() => {
    if (countdown <= 0) return;
    const t = setInterval(() => setCountdown(c => c - 1), 1000);
    return () => clearInterval(t);
  }, [countdown]);

  const verifyCode = async () => {
    if (code.length !== 6 || !challengeId) return;
    try {
      const res = await fetch("/api/auth/verify-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ phone, code, challengeId }),
      });
      const data = await res.json();
      if (res.ok && data.authenticated) {
        setStep("phone");
        setPhone("");
        setCode("");
        setChallengeId("");
        onLoginSuccess();
      } else {
        alert(data.error || "发送失败");
      }
    } catch {
      alert("网络错误，请重试");
    }
  };

  return (
    <div style={{
      position: "absolute", inset: 0, zIndex: 10,
      display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "flex-end",
      padding: "0 32px 140px",
    }}>
      {/* Welcome text */}
      <div style={{
        color: "#FFF3E8", fontSize: 22, fontWeight: 300,
        letterSpacing: "0.06em", marginBottom: 8,
        textAlign: "center",
      }}>
        你的记忆世界
      </div>
      <div style={{
        color: "#8a7060", fontSize: 13, fontWeight: 300,
        marginBottom: 40, textAlign: "center",
      }}>
        每一次回来，都是重逢      </div>

      {/* Login card */}
      <div style={{
        width: "100%", maxWidth: 320,
        background: "rgba(11,10,8,0.7)",
        backdropFilter: "blur(20px)",
        WebkitBackdropFilter: "blur(20px)",
        borderRadius: 20,
        border: "0.5px solid rgba(255,210,166,0.08)",
        padding: "28px 24px",
        display: "flex", flexDirection: "column", gap: 16,
      }}>
        {step === "phone" ? (
          <>
            <input
              type="tel"
              value={phone}
              onChange={e => setPhone(e.target.value)}
              placeholder="输入手机号"
              autoFocus
              style={{
                height: 48, padding: "0 18px", borderRadius: 14,
                border: "0.5px solid rgba(255,210,166,0.12)",
                background: "rgba(255,210,166,0.04)",
                color: "#FFD2A6", fontSize: 15, outline: "none",
                fontWeight: 300, letterSpacing: "0.04em",
              }}
            />
            <button onClick={sendCode} disabled={!phone || sending} style={{
              height: 48, borderRadius: 14, border: "none",
              background: phone ? "rgba(214,168,110,0.2)" : "rgba(255,255,255,0.03)",
              color: phone ? "#FFD2A6" : "rgba(255,255,255,0.2)",
              fontSize: 15, fontWeight: 400, cursor: phone ? "pointer" : "default",
              letterSpacing: "0.06em",
              transition: "all 0.3s ease",
            }}>
              {sending ? "发送中..." : "获取验证码"}
            </button>
          </>
        ) : (
          <>
            <div style={{ color: "#8a7060", fontSize: 12, textAlign: "center" }}>
              验证码已发送至 {phone}
            </div>
            <div style={{ color: '#FFD2A6', fontSize: 14, fontWeight: 400, letterSpacing: '0.08em', textAlign: 'center', marginBottom: 16 }}>验证码已发送
            </div>
            <div style={{ color: '#8a7060', fontSize: 12, textAlign: 'center' }}>
            </div>
            <input
              type="text"
              value={code}
              onChange={e => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              placeholder="输入验证码"
              autoFocus
              maxLength={6}
              style={{
                height: 48, padding: "0 18px", borderRadius: 14,
                border: "0.5px solid rgba(255,210,166,0.12)",
                background: "rgba(255,210,166,0.04)",
                color: "#FFD2A6", fontSize: 20, outline: "none",
                fontWeight: 300, letterSpacing: "0.3em", textAlign: "center",
              }}
            />
            <button onClick={verifyCode} disabled={code.length < 4} style={{
              height: 48, borderRadius: 14, border: "none",
              background: code.length >= 4 ? "rgba(214,168,110,0.2)" : "rgba(255,255,255,0.03)",
              color: code.length >= 4 ? "#FFD2A6" : "rgba(255,255,255,0.2)",
              fontSize: 15, fontWeight: 400, cursor: code.length >= 4 ? "pointer" : "default",
              transition: "all 0.3s ease",
            }}>
              进入忆见
            </button>
            <button onClick={() => setStep("phone")} style={{
              background: "none", border: "none",
              color: "#8a7060", fontSize: 12, cursor: "pointer",
              alignSelf: "center",
            }}>
              {countdown > 0 ? `${countdown}s 后重发` : "更换手机号"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

/* 鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲
   CHAT OVERLAY 鈥?bound to entity dialogue
   鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲 */



/* TTS Play Button */
function TtsPlayButton({ text }: { text: string }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  const handlePlay = async () => {
    if (loading) return;
    setLoading(true);
    setError(false);
    try {
      const res = await fetch("/api/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      const data = await res.json();
      if (data.audioUrl) {
        const audio = new Audio(data.audioUrl);
        audio.play().catch(() => setError(true));
      } else {
        setError(true);
      }
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ padding: "4px 0 0 4px" }}>
      {error ? (
        <span style={{ fontSize: 10, color: "rgba(255,100,100,0.5)", fontWeight: 300 }}>
          Sound generation failed
        </span>
      ) : (
        <button
          onClick={handlePlay}
          disabled={loading}
          style={{
            background: "none",
            border: "none",
            color: loading ? "rgba(255,210,166,0.2)" : "rgba(255,210,166,0.45)",
            fontSize: 11, fontWeight: 300,
            cursor: loading ? "default" : "pointer",
            padding: 0,
            letterSpacing: "0.04em",
          }}
        >
          {loading ? "..." : "\u25B6 Play voice"}
        </button>
      )}
    </div>
  );
}
function ChatOverlay({ entity, onBack, personality }: {
  entity: { id: string; name: string };
  onBack: () => void;
  personality?: EntityPersonality;
}) {
  const [input, setInput] = useState("");
    const [messages, setMessages] = useState<Array<{ role: string; content: string }>>(() => {
    const initial = personality
      ? pickTabSpeech(entity.id, "chat", personality)
      : "\u4f60\u597d\u3002";
    return [{ role: "assistant", content: initial }];
  });

  const send = () => {
    if (!input.trim()) return;
    setMessages(prev => [...prev, { role: "user", content: input.trim() }]);
    recordClick();
        setTimeout(() => {
      // Evolve personality
      const evolved = personality ? evolvePersonality(personality, 0.3) : undefined;
      if (evolved) savePersonality(evolved);

      const key = "memory_personality_" + entity.id;
      let pr = { traits: { warmth: 30, attachment: 20, openness: 40, memoryDepth: 10, stability: 50, lonelinessSensitivity: 30 }, sessions: 0 };
      try { const raw = localStorage.getItem(key); if (raw) pr = JSON.parse(raw); } catch {}
      pr.traits.attachment = Math.min(100, pr.traits.attachment + 2);
      pr.traits.memoryDepth = Math.min(100, pr.traits.memoryDepth + 1);
      pr.sessions += 1;
      try { localStorage.setItem(key, JSON.stringify(pr)); } catch {}
            const reply = evolved
        ? pickTabSpeech(entity.id, "chat", evolved)
        : "\u4f60\u597d\u3002";
      setMessages(prev => [...prev, { role: "assistant", content: reply }]);
    }, 800);
    setInput("");
  };

  return (
    <div style={{
      position: "absolute", inset: 0, zIndex: 15,
      display: "flex", flexDirection: "column",
      background: "rgba(11,10,8,0.94)",
      backdropFilter: "blur(16px)", WebkitBackdropFilter: "blur(16px)",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "14px 18px", borderBottom: "0.5px solid rgba(255,210,166,0.08)" }}>
        <button onClick={onBack} style={{ background: "none", border: "none", color: "#8a7060", fontSize: 20, cursor: "pointer", fontWeight: 200 }}>{"\u2190"}</button>
        <div style={{ width: 28, height: 28, borderRadius: "50%", background: "rgba(255,210,166,0.08)", display: "flex", alignItems: "center", justifyContent: "center", color: "#FFD2A6", fontSize: 13 }}>{entity.name.charAt(0)}</div>
        <span style={{ color: "#FFD2A6", fontSize: 15, fontWeight: 400, letterSpacing: "0.04em" }}>{entity.name}</span>
      </div>
      <div style={{ flex: 1, overflowY: "auto", padding: "20px", display: "flex", flexDirection: "column", gap: 16 }}>
        {messages.map((m, i) => (
          <div key={i} style={{ alignSelf: m.role === "user" ? "flex-end" : "flex-start", maxWidth: "80%" }}>
            <div style={{ padding: "10px 18px", borderRadius: 18, background: m.role === "user" ? "rgba(255,210,166,0.08)" : "rgba(255,210,166,0.04)", color: "#FFF3E8", fontSize: 14, lineHeight: 1.7, fontWeight: 300 }}>{m.content}</div>
            {m.role === "assistant" && <TtsPlayButton text={m.content} />}
          </div>
        ))}
      </div>
      <div style={{ padding: "14px 18px", borderTop: "0.5px solid rgba(255,210,166,0.08)", display: "flex", gap: 8 }}>
        <input value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => { if (e.key === "Enter") send() }} placeholder={"\u548c " + entity.name + " \u8bf4\u70b9\u4ec0\u4e48..."} autoFocus style={{ flex: 1, height: 44, padding: "0 18px", borderRadius: 22, border: "0.5px solid rgba(255,210,166,0.12)", background: "rgba(255,210,166,0.04)", color: "#FFD2A6", fontSize: 14, outline: "none", fontWeight: 300 }} />
        <button onClick={send} style={{ width: 44, height: 44, borderRadius: "50%", border: "none", background: input.trim() ? "rgba(255,210,166,0.12)" : "rgba(255,255,255,0.03)", color: input.trim() ? "#FFD2A6" : "rgba(255,255,255,0.15)", cursor: input.trim() ? "pointer" : "default", fontSize: 18 }}>{"\u2191"}</button>
      </div>
    </div>
  );
}

/* 鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲
   MEMORY OVERLAY 鈥?memory wall cards
   鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲 */

function MemoryOverlay() {
  const cards = [
    { title: "\u7ae5\u5e74\u7684\u9662\u5b50", hint: "\u590f\u5929 \u00b7 \u68a7\u6850\u6811\u4e0b" },
    { title: "\u6bcd\u4eb2\u7684\u53a8\u623f", hint: "\u665a\u996d\u7684\u6e29\u5ea6" },
    { title: "\u6545\u4e61\u7684\u96e8", hint: "\u6da6\u6e7f\u7684\u571f\u8def" },
  ];

  return (
    <div style={{
      position: "absolute", inset: 0, zIndex: 10,
      display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center",
      gap: 16, padding: "0 32px",
    }}>
      {cards.map((c, i) => (
        <div key={i} style={{
          width: "100%", maxWidth: 320,
          padding: "20px 24px", borderRadius: 16,
          background: "rgba(255,210,166,0.04)",
          border: "0.5px solid rgba(255,210,166,0.06)",
          backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)",
        }}>
          <div style={{ color: "#FFD2A6", fontSize: 16, fontWeight: 400, marginBottom: 6 }}>{c.title}</div>
          <div style={{ color: "#8a7060", fontSize: 12, fontWeight: 300 }}>{c.hint}</div>
        </div>
      ))}
    </div>
  );
}

/* 鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲
   PROFILE OVERLAY
   鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲 */

function ProfileOverlay() {
  return (
    <div style={{
      position: "absolute", inset: 0, zIndex: 10,
      display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center",
      color: "#FFF3E8",
    }}>
      <div style={{
        width: 64, height: 64, borderRadius: "50%",
        background: "rgba(255,210,166,0.08)",
        border: "0.5px solid rgba(255,210,166,0.12)",
        display: "flex", alignItems: "center", justifyContent: "center",
        marginBottom: 16,
      }}>
        <span style={{ fontSize: 24, color: "#FFD2A6" }}>{"\u2661"}</span>
      </div>
      <div style={{ fontSize: 15, fontWeight: 300, color: "#FFD2A6", letterSpacing: "0.06em" }}>{"\u6211\u7684\u8bb0\u5fc6\u4e16\u754c"}</div>
      <div style={{ fontSize: 12, color: "#8a7060", marginTop: 8, fontWeight: 300 }}>{"\u4f60\u5df2\u7ecf\u6765\u8fc7 3 \u6b21"}</div>
    </div>
  );
}

/* 鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲
   WORLD SHELL 鈥?Single Dream Space
   鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲 */


/* 鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲
   HOME LOGGED IN 鈥?post-splash entity selection
   鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲 */



export default function WorldShell() {
  const [loggedIn, setLoggedIn] = useState(false);
  
  const [appState, setAppState] = useState<AppState>(getAppState());
  const [tabState, setTabState] = useState(getTabState());
  const [chatEntity, setChatEntity] = useState<AppMemoryEntity | null>(null);
  const [personalities, setPersonalities] = useState<Record<string, EntityPersonality>>({});
  const prevTabRef = useRef<TabMode>("home");

  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/auth/session", {
      cache: "no-store",
      credentials: "same-origin",
      signal: controller.signal,
    }).then((response) => {
      if (!controller.signal.aborted) setLoggedIn(response.ok);
    }).catch(() => {
      if (!controller.signal.aborted) setLoggedIn(false);
    });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    const unsubApp = subscribe(setAppState);
    const unsubTab = subscribeTab(setTabState);

        // Load personalities for all known entities
    const ids = ["father", "mother", "friend"];
    const loaded: Record<string, EntityPersonality> = {};
    ids.forEach(id => { loaded[id] = loadPersonality(id); });
    setPersonalities(loaded);

    // Boot entities
    const bootTimer = setTimeout(() => {
      if (appState.mode === "boot") {
        setEntities([
          { id: "father", name: "\u7236\u4eb2", relationship: "\u7236\u5b50", emotionState: "calm" },
          { id: "mother", name: "\u6bcd\u4eb2", relationship: "\u6bcd\u5b50", emotionState: "happy" },
          { id: "friend", name: "\u6545\u53cb", relationship: "\u631a\u53cb", emotionState: "memory" },
        ]);
        setBootProgress(1);
      }
    }, 2000);

    // Mouse tracking for emotion
    const onMove = (ev: MouseEvent) => { recordMouseMove(ev.clientX, ev.clientY, Date.now()); };
    const onClick = () => { recordClick(); };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("click", onClick);
    const emotionInterval = setInterval(() => { tickUserEmotion(0.5); }, 500);

    return () => {
      unsubApp(); unsubTab();
      clearTimeout(bootTimer);
      clearInterval(emotionInterval);
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("click", onClick);
    };
  }, []);

    // Watch tab changes 鈫?transition all personalities
  useEffect(() => {
    const newTab = tabState.mode;
    if (newTab !== prevTabRef.current) {
      prevTabRef.current = newTab;
      setPersonalities(prev => {
        const next: Record<string, EntityPersonality> = {};
        for (const [id, p] of Object.entries(prev)) {
          next[id] = transitionToTab(p, newTab);
          savePersonality(next[id]);
        }
        return next;
      });
    }
  }, [tabState.mode]);

  const handleEntitySelect = (e: AppMemoryEntity) => {
    recordClick();
    setChatEntity(e);
    setTabMode("chat");
    // Evolve personality on selection
    setPersonalities(prev => {
      const p = prev[e.id];
      if (p) {
        const evolved = evolvePersonality(p, 0.5);
        savePersonality(evolved);
        return { ...prev, [e.id]: evolved };
      }
      return prev;
    });
  };

  const handleChatBack = () => {
    setChatEntity(null);
    setTabMode("home");
  };

  const currentMode = chatEntity ? "chat" : tabState.mode;

  return (
    <div style={{
      position: "fixed", inset: 0, background: DREAM.bg,
      fontFamily: "system-ui, -apple-system, 'Noto Serif SC', 'Noto Sans SC', sans-serif",
    }}>
      <Canvas
        camera={{ position: [0, 0, 280], fov: 55, near: 1, far: 800 }}
        dpr={[1, 1.5]}
        gl={{
          antialias: true,
          toneMapping: THREE.ACESFilmicToneMapping,
          toneMappingExposure: 0.85,
          outputColorSpace: THREE.SRGBColorSpace,
          failIfMajorPerformanceCaveat: false,
        }}
      >
                <DreamScene
          entities={appState.entities}
          onEntityClick={handleEntitySelect}
          tabMode={currentMode as TabMode}
          personalities={personalities}
        />
      </Canvas>

      {currentMode === "home" && !loggedIn && (
        <>
          {/* ═══ 记忆灵魂体 — 登录界面 empty 状态背景 ═══ */}
          <div style={{
            position: "absolute", inset: 0, zIndex: 5,
            pointerEvents: "none",
          }}>
            <MemorySoulBody state="empty" />
          </div>
          <HomeOverlay onLoginSuccess={() => setLoggedIn(true)} />
        </>
      )}
      {loggedIn && currentMode === "home" && (
        <HomeV3 />
      )}

            {currentMode === "chat" && chatEntity && (
        <ChatOverlay
          entity={chatEntity}
          onBack={handleChatBack}
          personality={personalities[chatEntity.id]}
        />
      )}

      {currentMode === "memory" && <MemoryOverlay />}

      {currentMode === "profile" && <ProfileOverlay />}

      {/* Bottom Tab — always present */}
      <div style={{
        position: "fixed", bottom: 62, left: 0, right: 0, zIndex: 15,
        textAlign: "center", pointerEvents: "none",
      }}>
        <span style={{
          fontSize: 9, fontWeight: 300, color: "rgba(255,210,166,0.25)",
          letterSpacing: "0.04em",
        }}>
          苏ICP备2026040056号
        </span>
      </div>

      <BottomTab active={currentMode as TabMode} />
    </div>
  );
}





















