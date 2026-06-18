"use client";
import { useEffect, useState, useRef } from "react";
import { Canvas } from "@react-three/fiber";
import { EffectComposer, Bloom } from "@react-three/postprocessing";
import * as THREE from "three";
import StarField3D from "./StarField3D";
import MemoryGate from "./MemoryGate";
import Silhouettes from "./Silhouettes";
import CameraRig from "./CameraRig";
import { COLORS, TIMELINE, GATE } from "./scene-config";

function SceneContent({ elapsed }: { elapsed: number }) {
  const openProgress = elapsed > TIMELINE.doorOpen
    ? Math.min((elapsed - TIMELINE.doorOpen) / (TIMELINE.passThrough - TIMELINE.doorOpen), 1)
    : 0;

  const glowIntensity = elapsed > TIMELINE.doorGlow
    ? Math.min((elapsed - TIMELINE.doorGlow) / 1.5, 1) * 1.5
    : 0.1;

  const silhouettesVisible = elapsed > TIMELINE.silhouettes;

  return (
    <>
      <color attach="background" args={[COLORS.bg]} />
      <fog attach="fog" args={[COLORS.bg, 6, 22]} />

      <ambientLight intensity={0.15} color={COLORS.gold} />
      <directionalLight position={[2, 3, 3]} intensity={0.2} color={COLORS.white} />

      <StarField3D />
      <group position={[0, 0.2, 0]}>
        <MemoryGate openProgress={openProgress} glowIntensity={glowIntensity} />
        <Silhouettes visible={silhouettesVisible} />
      </group>

      {/* Ground plane with subtle reflection */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -1.9, 0]} receiveShadow>
        <planeGeometry args={[12, 12]} />
        <meshStandardMaterial color={COLORS.bg} roughness={0.9} metalness={0.1} transparent opacity={0.5} />
      </mesh>

      {/* Volumetric fog proxy */}
      <mesh position={[0, 0, -1]} scale={[4, 3.8, 1]}>
        <planeGeometry />
        <meshBasicMaterial color={COLORS.gold} transparent opacity={0.015 + glowIntensity * 0.015} depthWrite={false} side={THREE.DoubleSide} />
      </mesh>

      <CameraRig elapsed={elapsed} totalDuration={TIMELINE.total} />
      <EffectComposer>
        <Bloom
          luminanceThreshold={0.2}
          luminanceSmoothing={0.9}
          intensity={0.6 + glowIntensity * 1.2}
          radius={0.5}
          mipmapBlur
        />
      </EffectComposer>
    </>
  );
}

type Props = { onComplete: () => void };

export default function MemoryGateScene({ onComplete }: Props) {
  const [elapsed, setElapsed] = useState(0);
  const startRef = useRef(0);
  const rafRef = useRef(0);

  useEffect(() => {
    startRef.current = performance.now();
    function tick() {
      const e = (performance.now() - startRef.current) / 1000;
      setElapsed(e);
      if (e >= TIMELINE.total) {
        onComplete();
        return;
      }
      rafRef.current = requestAnimationFrame(tick);
    }
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [onComplete]);

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 9999, background: COLORS.bg }}>
      <Canvas
        camera={{ position: [0, 0.4, 7.5], fov: 45, near: 0.1, far: 40 }}
        dpr={[1, 2]}
        gl={{ antialias: true, toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 1.2 }}
      >
        <SceneContent elapsed={elapsed} />
      </Canvas>
    </div>
  );
}