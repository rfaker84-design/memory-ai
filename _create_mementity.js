const fs = require("fs");

const content = `"use client";

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
  emotion?: string;        // "calm" | "lonely" | "nostalgic" | "warm" | "emotional"
  onClick?: () => void;
}

export default function MemoryEntity({
  position,
  scale = 1,
  emotion = "calm",
  onClick,
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

    // Emotion-driven breathing
    const breathAmp = emotion === "emotional" ? 0.015 : emotion === "calm" ? 0.006 : 0.01;
    const breathSpeed = emotion === "emotional" ? 1.8 : emotion === "calm" ? 0.8 : 1.2;
    const breathe = 1 + Math.sin(timeRef.current * breathSpeed) * breathAmp;
    groupRef.current.scale.setScalar(scale * breathe);

    // Subtle head movement
    const headSway = emotion === "lonely" ? 0.03 : 0.015;
    headRef.current.rotation.y = Math.sin(timeRef.current * 0.4) * headSway;
    headRef.current.rotation.x = Math.cos(timeRef.current * 0.35) * headSway * 0.5;

    // Slow float
    const floatY = Math.sin(timeRef.current * 0.3) * 0.15;
    groupRef.current.position.y = position[1] + floatY;

    // Emotion-driven approach (warm → slightly closer)
    const zOffset = emotion === "warm" ? 0.3 : emotion === "lonely" ? -0.2 : 0;
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
`;

fs.writeFileSync("components/world/MemoryEntity.tsx", content, "utf8");
console.log("MemoryEntity.tsx created");