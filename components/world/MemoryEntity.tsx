"use client";

import { useRef, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

/* ============================================================
   忆见 MemoryAI — Memory Entity (Realistic Human Form)
   Dream Layer · Soft material · Breathing · Subtle movement
   No emissive. No neon. No particles. Just presence.
   ============================================================ */

interface MemoryEntityProps {
  position: [number, number, number];
  color?: string;
  scale?: number;
  emotion?: string;
  onClick?: () => void;
  /* Personality-driven behavior */
  movementSpeed?: number;      // 0–2 multiplier
  glowIntensity?: number;      // 0–1
  gazeActive?: boolean;        // whether head tracks camera
  breathingRate?: number;      // 0–3 multiplier
}

export default function MemoryEntity({
  position,
  scale = 1,
  emotion = "calm",
  onClick,
  movementSpeed = 1.0,
  glowIntensity = 0.6,
  gazeActive = false,
  breathingRate = 1.0,
}: MemoryEntityProps) {
  const groupRef = useRef<THREE.Group>(null);
  const headRef = useRef<THREE.Group>(null);
  const timeRef = useRef(Math.random() * Math.PI * 2);

  // Realistic material — roughness high, metalness zero, no emissive
  const skinMat = useMemo(() => new THREE.MeshStandardMaterial({
    color: "#d4b896",
    roughness: 0.7,
    metalness: 0.0,
  }), []);

  const clothMat = useMemo(() => new THREE.MeshStandardMaterial({
    color: "#3a3530",
    roughness: 0.85,
    metalness: 0.0,
  }), []);

  const eyeMat = useMemo(() => new THREE.MeshStandardMaterial({
    color: "#1a1510",
    roughness: 0.3,
    metalness: 0.0,
  }), []);

  useFrame((_, delta) => {
    if (!groupRef.current || !headRef.current) return;
    timeRef.current += delta;

        // Personality-driven breathing
    const breathAmp = emotion === "emotional" ? 0.015 : emotion === "calm" ? 0.006 : 0.01;
    const breathSpeed = emotion === "emotional" ? 1.8 : emotion === "calm" ? 0.8 : 1.2;
    const breathe = 1 + Math.sin(timeRef.current * breathSpeed * breathingRate) * breathAmp;
    groupRef.current.scale.setScalar(scale * breathe);

        // Personality-driven head movement (gaze tracks when active)
    const headSway = gazeActive ? 0.04 : emotion === "lonely" ? 0.03 : 0.015;
    headRef.current.rotation.y = Math.sin(timeRef.current * 0.4 * movementSpeed) * headSway;
    headRef.current.rotation.x = Math.cos(timeRef.current * 0.35 * movementSpeed) * headSway * 0.5;

        // Personality-driven slow float
    const floatY = Math.sin(timeRef.current * 0.3 * movementSpeed) * 0.15;
    groupRef.current.position.y = position[1] + floatY;

        // Emotion-driven approach (warm → slightly closer)
    const zOffset = emotion === "warm" ? 0.4 : emotion === "lonely" ? -0.3 : 0;
    groupRef.current.position.z = position[2] + zOffset;
  });

  return (
    <group ref={groupRef} position={position} onClick={onClick}>
      {/* Body — simple cylinder with tapered top */}
      <mesh position={[0, -0.8, 0]} material={clothMat} castShadow>
        <cylinderGeometry args={[0.22, 0.3, 1.4, 16]} />
      </mesh>

      {/* Shoulders */}
      <mesh position={[0, -0.05, 0]} material={clothMat}>
        <sphereGeometry args={[0.32, 16, 12, 0, Math.PI * 2, 0, Math.PI / 2]} />
      </mesh>

      {/* Neck */}
      <mesh position={[0, 0.25, 0]} material={skinMat}>
        <cylinderGeometry args={[0.07, 0.09, 0.2, 12]} />
      </mesh>

      {/* Head group — subtle movement pivot */}
      <group ref={headRef} position={[0, 0.48, 0]}>
        {/* Head */}
        <mesh material={skinMat} castShadow>
          <sphereGeometry args={[0.15, 16, 16]} />
        </mesh>

        {/* Eyes */}
        <mesh position={[-0.05, 0.03, 0.13]} material={eyeMat}>
          <sphereGeometry args={[0.018, 8, 8]} />
        </mesh>
        <mesh position={[0.05, 0.03, 0.13]} material={eyeMat}>
          <sphereGeometry args={[0.018, 8, 8]} />
        </mesh>

        {/* Subtle nose */}
        <mesh position={[0, -0.01, 0.14]} material={eyeMat}>
          <sphereGeometry args={[0.01, 6, 6]} />
        </mesh>

        {/* Mouth line */}
        <mesh position={[0, -0.04, 0.14]} rotation={[0, 0, 0]}>
          <boxGeometry args={[0.04, 0.003, 0.003]} />
          <meshStandardMaterial color="#8a7060" roughness={0.5} metalness={0} />
        </mesh>
      </group>

      {/* Arms — subtle at sides */}
      <mesh position={[-0.28, -0.3, 0]} rotation={[0, 0, 0.2]} material={clothMat}>
        <capsuleGeometry args={[0.06, 0.8, 8, 12]} />
      </mesh>
      <mesh position={[0.28, -0.3, 0]} rotation={[0, 0, -0.2]} material={clothMat}>
        <capsuleGeometry args={[0.06, 0.8, 8, 12]} />
      </mesh>
    </group>
  );
}
