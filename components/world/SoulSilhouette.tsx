"use client";

import { useRef, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import { useTexture } from "@react-three/drei";
import * as THREE from "three";

/* ============================================================
   忆见 — Soul Silhouette
   Loads /silhouette.svg as texture on plane
   ============================================================ */

export default function SoulSilhouette() {
  const groupRef = useRef<THREE.Group>(null);
  const texture = useTexture("/silhouette.svg");

  useFrame((_, delta) => {
    if (!groupRef.current) return;
    const t = performance.now() * 0.001;
    groupRef.current.position.y = Math.sin(t * 0.4) * 0.2;
    groupRef.current.scale.setScalar(1 + Math.sin(t * 1.2) * 0.025);
  });

  return (
    <group ref={groupRef}>
      <mesh>
        <planeGeometry args={[3.0, 4.5]} />
        <meshBasicMaterial map={texture} transparent depthWrite={false}
          blending={THREE.AdditiveBlending} side={THREE.DoubleSide} />
      </mesh>
    </group>
  );
}