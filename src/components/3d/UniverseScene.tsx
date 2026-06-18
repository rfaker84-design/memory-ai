"use client";
import { useState, useEffect, useRef, useMemo, useCallback, Suspense } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { EffectComposer, Bloom } from "@react-three/postprocessing";
import * as THREE from "three";
import StarField3D from "./StarField3D";
import SpaceGate from "./SpaceGate";
import MemoryMoon from "./MemoryMoon";
import MemoryPlanet from "./MemoryPlanet";
import UniverseCamera from "./UniverseCamera";
import { U, TIMING, DEFAULT_PLANETS, type UniverseState, type MemoryPlanet as PlanetType } from "./universe-config";

/* ── 3D Scene Content ────────────────────────────────── */
function UniverseContent({
  state, elapsed, planets, onSelectPlanet, focusPlanet,
}: {
  state: UniverseState;
  elapsed: number;
  planets: PlanetType[];
  onSelectPlanet: (id: string) => void;
  focusPlanet: PlanetType | null;
}) {
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  // Splash gate progress
  const gateOpen = state === "SPLASH"
    ? Math.min(Math.max((elapsed - TIMING.doorOpen) / (TIMING.pushThrough - TIMING.doorOpen), 0), 1)
    : 1;
  const gateGlow = state === "SPLASH"
    ? Math.min(elapsed / TIMING.doorGlow, 1) * 1.5
    : 0;
  const gateVisible = state === "SPLASH";

  // Bloom intensity changes with state
  const bloomIntensity = state === "SPLASH"
    ? 0.5 + gateGlow * 1.5
    : state === "FOCUS" ? 0.9 : 0.6;

  return (
    <>
      <color attach="background" args={[U.bg]} />
      <fog attach="fog" args={[U.bg, U.fogNear, U.fogFar]} />
      <ambientLight intensity={0.08} color={U.moonGlow} />
      <directionalLight position={[5, 8, 5]} intensity={0.15} color={U.moonInner} />

      <StarField3D />

      {/* Space Gate (splash phase only) */}
      <SpaceGate openProgress={gateOpen} glowIntensity={gateGlow} visible={gateVisible} />

      {/* Memory Moon (visible after splash) */}
      {(state === "UNIVERSE" || state === "FOCUS") && <MemoryMoon />}

      {/* Memory Planets */}
      {(state === "UNIVERSE" || state === "FOCUS") && planets.map(p => (
        <MemoryPlanet
          key={p.id}
          planet={p}
          onClick={() => onSelectPlanet(p.id)}
          hovered={hoveredId === p.id}
          onHover={(v) => setHoveredId(v ? p.id : null)}
        />
      ))}

      {/* Subtle ground disc */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -3, 0]}>
        <circleGeometry args={[14, 64]} />
        <meshBasicMaterial color={U.bg} transparent opacity={0.4} depthWrite={false} />
      </mesh>

      <UniverseCamera state={state} elapsed={elapsed} focusPlanet={focusPlanet} />

      {/* Orbit controls (universe state only) */}
      {state === "UNIVERSE" && (
        <OrbitControls
          enableDamping dampingFactor={0.08}
          minDistance={3} maxDistance={18}
          maxPolarAngle={Math.PI * 0.65}
          target={[0, 0, 0]}
        />
      )}

      <EffectComposer>
        <Bloom luminanceThreshold={0.15} luminanceSmoothing={0.9} intensity={bloomIntensity} radius={0.5} mipmapBlur />
      </EffectComposer>
    </>
  );
}

/* ── Props ────────────────────────────────────────────── */
type Props = {
  planets?: PlanetType[];
  onSelectPlanet: (id: string) => void;
};

/* ════════════════════════════════════════════════════════
   UniverseScene — Single Canvas, Three States
   SPLASH → UNIVERSE → FOCUS
   ════════════════════════════════════════════════════════ */
export default function UniverseScene({ planets: customPlanets, onSelectPlanet }: Props) {
  const [state, setState] = useState<UniverseState>("SPLASH");
  const [elapsed, setElapsed] = useState(0);
  const [focusPlanet, setFocusPlanet] = useState<PlanetType | null>(null);
  const startRef = useRef(0);
  const rafRef = useRef(0);

  const planets = useMemo(() => customPlanets && customPlanets.length > 0 ? customPlanets : DEFAULT_PLANETS, [customPlanets]);

  const handleSelect = useCallback((id: string) => {
    const p = planets.find(pl => pl.id === id);
    if (p) {
      setFocusPlanet(p);
      setState("FOCUS");
    }
  }, [planets]);

  // Splash → Universe timer
  useEffect(() => {
    if (state !== "SPLASH") return;
    startRef.current = performance.now();
    function tick() {
      const e = (performance.now() - startRef.current) / 1000;
      setElapsed(e);
      if (e >= TIMING.totalSplash) {
        setState("UNIVERSE");
        return;
      }
      rafRef.current = requestAnimationFrame(tick);
    }
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [state]);

  // Universe elapsed time
  useEffect(() => {
    if (state !== "UNIVERSE" && state !== "FOCUS") return;
    const interval = setInterval(() => {
      setElapsed(prev => prev + 0.05);
    }, 50);
    return () => clearInterval(interval);
  }, [state]);

  return (
    <div style={{ position: "fixed", inset: 0, background: U.bg }}>
      {/* HTML overlay for focus state */}
      {state === "FOCUS" && focusPlanet && (
        <div style={{
          position: "absolute", bottom: 0, left: 0, right: 0, zIndex: 10,
          padding: "20px 24px calc(20px + env(safe-area-inset-bottom,0px))",
          background: "linear-gradient(to top, rgba(2,4,8,0.95) 0%, rgba(2,4,8,0.7) 60%, transparent 100%)",
          display: "flex", flexDirection: "column", alignItems: "center", gap: 14,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 36, height: 36, borderRadius: "50%", background: "rgba(255,179,124,0.15)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, fontWeight: 700, color: focusPlanet.color }}>
              {focusPlanet.name.charAt(0)}
            </div>
            <div>
              <p style={{ margin: 0, fontSize: 16, fontWeight: 600, color: "#FFF3E8", letterSpacing: "0.04em" }}>{focusPlanet.name}</p>
              <p style={{ margin: 0, fontSize: 12, color: "rgba(214,187,166,0.5)" }}>{focusPlanet.relationship} · 情绪强度 {Math.round(focusPlanet.emotionIntensity * 100)}%</p>
            </div>
          </div>
          <div style={{ display: "flex", gap: 10, width: "100%", maxWidth: 300 }}>
            <button
              onClick={() => { setState("UNIVERSE"); setFocusPlanet(null); }}
              style={{
                flex: 1, padding: "12px 0", borderRadius: 14,
                border: "0.5px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.04)",
                color: "rgba(214,187,166,0.7)", fontSize: 14, fontWeight: 500,
                cursor: "pointer", letterSpacing: "0.04em",
              }}
            >
              返回宇宙
            </button>
            <button
              onClick={() => onSelectPlanet(focusPlanet.id)}
              style={{
                flex: 2, padding: "12px 0", borderRadius: 14,
                border: "0.5px solid rgba(255,179,124,0.25)", background: "rgba(255,179,124,0.12)",
                color: "#FFB37C", fontSize: 14, fontWeight: 600,
                cursor: "pointer", letterSpacing: "0.04em",
              }}
            >
              开始对话
            </button>
          </div>
        </div>
      )}

      <Canvas
        camera={{ position: [0, 0.5, U.cameraStartZ], fov: 50, near: 0.1, far: 60 }}
        dpr={[1, 2]}
        gl={{ antialias: true, toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 1.1 }}
      >
        <UniverseContent state={state} elapsed={elapsed} planets={planets} onSelectPlanet={handleSelect} focusPlanet={focusPlanet} />
      </Canvas>
    </div>
  );
}