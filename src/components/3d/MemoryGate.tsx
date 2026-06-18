"use client";
import { useRef, useMemo } from "react";
import * as THREE from "three";
import { GATE, COLORS } from "./scene-config";

type Props = { openProgress: number; glowIntensity: number };

export default function MemoryGate({ openProgress, glowIntensity }: Props) {
  const groupRef = useRef<THREE.Group>(null);

  const frameMaterial = useMemo(() =>
    new THREE.MeshStandardMaterial({
      color: COLORS.gold,
      roughness: 0.3,
      metalness: 0.9,
      emissive: COLORS.gold,
      emissiveIntensity: 0.4,
    }), []);

  const emissiveMat = useMemo(() =>
    new THREE.MeshStandardMaterial({
      color: COLORS.gold,
      roughness: 0.2,
      metalness: 0.7,
      emissive: COLORS.gold,
      emissiveIntensity: GATE.emissiveIntensity,
    }), []);

  const gapLightMat = useMemo(() =>
    new THREE.MeshBasicMaterial({
      color: COLORS.white,
      transparent: true,
      opacity: 0.9,
    }), []);

  const gw = GATE.width;
  const gh = GATE.height;
  const gd = GATE.depth;
  const fw = GATE.frameWidth;

  return (
    <group ref={groupRef}>
      {/* Door frame — top */}
      <mesh position={[0, gh / 2, 0]} material={frameMaterial}>
        <boxGeometry args={[gw + fw * 2, fw, gd]} />
      </mesh>
      {/* Door frame — bottom */}
      <mesh position={[0, -gh / 2, 0]} material={frameMaterial}>
        <boxGeometry args={[gw + fw * 2, fw, gd]} />
      </mesh>
      {/* Door frame — left */}
      <mesh position={[-(gw / 2 + fw / 2), 0, 0]} material={frameMaterial}>
        <boxGeometry args={[fw, gh, gd]} />
      </mesh>
      {/* Door frame — right */}
      <mesh position={[(gw / 2 + fw / 2), 0, 0]} material={frameMaterial}>
        <boxGeometry args={[fw, gh, gd]} />
      </mesh>

      {/* Left door */}
      <group position={[-(gw / 4) * openProgress, 0, 0]}>
        <mesh position={[-(gw / 4), 0, 0.01]} material={emissiveMat}>
          <boxGeometry args={[gw / 2 - 0.02, gh - 0.04, gd * 0.6]} />
        </mesh>
      </group>

      {/* Right door */}
      <group position={[(gw / 4) * openProgress, 0, 0]}>
        <mesh position={[gw / 4, 0, 0.01]} material={emissiveMat}>
          <boxGeometry args={[gw / 2 - 0.02, gh - 0.04, gd * 0.6]} />
        </mesh>
      </group>

      {/* Gap light (vertical glow slit) */}
      <mesh position={[0, 0, gd * 0.3]} material={gapLightMat} scale={[0.02, gh * 0.85, 1]}>
        <planeGeometry args={[1, 1]} />
      </mesh>

      {/* Point lights */}
      <pointLight position={[0, 0, gd * 2]} color={COLORS.gold} intensity={glowIntensity * 3} distance={8} decay={2} />
      <pointLight position={[0, gh * 0.4, gd * 2]} color={COLORS.white} intensity={glowIntensity * 1.5} distance={6} decay={2} />
    </group>
  );
}