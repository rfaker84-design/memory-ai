"use client";
import { useRef, useMemo } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { COLORS } from "./scene-config";

export default function Silhouettes({ visible }: { visible: boolean }) {
  const groupRef = useRef<THREE.Group>(null);

  const mat = useMemo(() =>
    new THREE.MeshBasicMaterial({ color: COLORS.bg, transparent: true, opacity: visible ? 1 : 0, side: THREE.DoubleSide, depthWrite: false }),
    [visible]);

  useFrame((_, delta) => {
    if (groupRef.current && visible) {
      groupRef.current.position.y += Math.sin(Date.now() * 0.001) * 0.003;
    }
  });

  return (
    <group ref={groupRef} position={[0, -1.1, -1.6]}>
      {/* Father silhouette */}
      <group position={[-0.25, 0, 0]}>
        <mesh position={[0, 1.1, 0]} material={mat}>
          <circleGeometry args={[0.18, 16]} />
        </mesh>
        <mesh position={[0, 0.55, 0]} material={mat}>
          <capsuleGeometry args={[0.22, 0.7, 4, 8]} />
        </mesh>
        <mesh position={[-0.1, -0.3, 0]} material={mat}>
          <capsuleGeometry args={[0.08, 0.7, 4, 8]} />
        </mesh>
        <mesh position={[0.1, -0.3, 0]} material={mat}>
          <capsuleGeometry args={[0.08, 0.7, 4, 8]} />
        </mesh>
      </group>

      {/* Child silhouette */}
      <group position={[0.3, -0.35, 0]} scale={0.65}>
        <mesh position={[0, 1.1, 0]} material={mat}>
          <circleGeometry args={[0.18, 16]} />
        </mesh>
        <mesh position={[0, 0.55, 0]} material={mat}>
          <capsuleGeometry args={[0.18, 0.5, 4, 8]} />
        </mesh>
        <mesh position={[-0.08, -0.2, 0]} material={mat}>
          <capsuleGeometry args={[0.06, 0.5, 4, 8]} />
        </mesh>
        <mesh position={[0.08, -0.2, 0]} material={mat}>
          <capsuleGeometry args={[0.06, 0.5, 4, 8]} />
        </mesh>
      </group>
    </group>
  );
}