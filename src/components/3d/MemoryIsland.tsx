"use client";
import { useRef, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import EmotionalAura from "./EmotionalAura";
import MemoryObjects from "./MemoryObjects";

type Props = {
  entity: { id: string; name: string; emotionIntensity: number; color: string };
  position: [number, number, number];
  onClick: () => void;
  hovered: boolean;
  onHover: (v: boolean) => void;
};

export default function MemoryIsland({ entity, position, onClick, hovered, onHover }: Props) {
  const groupRef = useRef<THREE.Group>(null);
  const platformRef = useRef<THREE.Mesh>(null);
  const avatarRef = useRef<THREE.Mesh>(null);

  const platMat = useMemo(() =>
    new THREE.MeshStandardMaterial({
      color: entity.color,
      roughness: 0.5,
      metalness: 0.6,
      emissive: entity.color,
      emissiveIntensity: 0.2 * entity.emotionIntensity,
      transparent: true,
      opacity: 0.8,
    }), [entity.color, entity.emotionIntensity]);

  const avatarMat = useMemo(() =>
    new THREE.MeshStandardMaterial({
      color: entity.color,
      roughness: 0.3,
      metalness: 0.4,
      emissive: entity.color,
      emissiveIntensity: 0.5 * entity.emotionIntensity,
      transparent: true,
      opacity: 0.7,
    }), [entity.color, entity.emotionIntensity]);

  useFrame((_, delta) => {
    if (groupRef.current) {
      const breathe = 1 + Math.sin(Date.now() * 0.0008) * 0.03;
      groupRef.current.position.y = position[1] + Math.sin(Date.now() * 0.001) * 0.15;
      groupRef.current.scale.setScalar(hovered ? 1.08 : breathe);
    }
    if (platformRef.current) {
      platformRef.current.rotation.y += delta * 0.1;
    }
    if (avatarRef.current) {
      avatarRef.current.rotation.y = -platformRef.current!.rotation.y;
    }
  });

  return (
    <group ref={groupRef} position={position}>
      {/* Floating platform */}
      <mesh
        ref={platformRef}
        position={[0, -0.15, 0]}
        onClick={(e) => { e.stopPropagation(); onClick(); }}
        onPointerOver={(e) => { e.stopPropagation(); onHover(true); }}
        onPointerOut={() => onHover(false)}
        material={platMat}
      >
        <cylinderGeometry args={[0.45, 0.5, 0.1, 32]} />
      </mesh>

      {/* Avatar presence (torus knot) */}
      <mesh ref={avatarRef} position={[0, 0.35, 0]} material={avatarMat}>
        <torusKnotGeometry args={[0.18, 0.06, 48, 8]} />
      </mesh>

      {/* Name label proxy (glowing sphere) */}
      <mesh position={[0, 0.65, 0]}>
        <sphereGeometry args={[0.06, 8, 8]} />
        <meshBasicMaterial color={entity.color} transparent opacity={0.9} />
      </mesh>

      {/* Emotional aura rings */}
      <EmotionalAura intensity={entity.emotionIntensity} color={entity.color} position={[0, 0.15, 0]} />

      {/* Memory fragments orbiting */}
      <MemoryObjects intensity={entity.emotionIntensity} color={entity.color} />
    </group>
  );
}