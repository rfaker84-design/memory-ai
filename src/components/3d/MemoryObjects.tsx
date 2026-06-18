"use client";
import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

type Props = { intensity: number; color: string };

function VoiceOrb({ offset, color, intensity }: { offset: [number, number, number]; color: string; intensity: number }) {
  const ref = useRef<THREE.Mesh>(null);
  const speed = 0.3 + Math.random() * 0.6;
  const amplitude = 0.15 + Math.random() * 0.3;
  const phase = Math.random() * Math.PI * 2;

  useFrame((_, delta) => {
    if (ref.current) {
      ref.current.position.y = offset[1] + Math.sin(Date.now() * 0.001 * speed + phase) * amplitude;
      const s = 0.7 + Math.sin(Date.now() * 0.002 + phase) * 0.3;
      ref.current.scale.setScalar(s * intensity);
    }
  });

  return (
    <mesh ref={ref} position={offset}>
      <sphereGeometry args={[0.08, 8, 8]} />
      <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.6 * intensity} roughness={0.3} metalness={0.5} transparent opacity={0.8} />
    </mesh>
  );
}

function TextShard({ offset, color }: { offset: [number, number, number]; color: string }) {
  const ref = useRef<THREE.Mesh>(null);
  const phase = Math.random() * Math.PI * 2;

  useFrame(() => {
    if (ref.current) {
      ref.current.rotation.y += 0.003;
      ref.current.position.y = offset[1] + Math.sin(Date.now() * 0.0008 + phase) * 0.2;
    }
  });

  return (
    <mesh ref={ref} position={offset} rotation={[0, Math.random() * Math.PI, Math.random() * 0.3]}>
      <planeGeometry args={[0.25, 0.12]} />
      <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.3} roughness={0.4} metalness={0.6} side={THREE.DoubleSide} transparent opacity={0.7} />
    </mesh>
  );
}

function PhotoShard({ offset, color }: { offset: [number, number, number]; color: string }) {
  const ref = useRef<THREE.Mesh>(null);
  const phase = Math.random() * Math.PI * 2;

  useFrame(() => {
    if (ref.current) {
      ref.current.rotation.y += 0.005;
      ref.current.position.y = offset[1] + Math.sin(Date.now() * 0.001 + phase) * 0.15;
    }
  });

  return (
    <mesh ref={ref} position={offset} rotation={[Math.random() * 0.6, Math.random() * Math.PI, 0]}>
      <planeGeometry args={[0.2, 0.28]} />
      <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.25} roughness={0.5} metalness={0.4} side={THREE.DoubleSide} transparent opacity={0.6} />
    </mesh>
  );
}

export default function MemoryObjects({ intensity, color }: Props) {
  const count = Math.floor(3 + intensity * 6);
  const items = useMemo(() => {
    const result: { type: "orb" | "text" | "photo"; offset: [number, number, number] }[] = [];
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2 + Math.random() * 0.5;
      const radius = 0.5 + Math.random() * 0.5;
      const y = -0.2 + Math.random() * 0.8;
      const types: ("orb" | "text" | "photo")[] = ["orb", "orb", "text", "photo"];
      result.push({
        type: types[i % types.length],
        offset: [Math.cos(angle) * radius, y, Math.sin(angle) * radius],
      });
    }
    return result;
  }, [count]);

  return (
    <group>
      {items.map((item, i) => {
        if (item.type === "orb") return <VoiceOrb key={i} offset={item.offset} color={color} intensity={intensity} />;
        if (item.type === "text") return <TextShard key={i} offset={item.offset} color={color} />;
        return <PhotoShard key={i} offset={item.offset} color={color} />;
      })}
    </group>
  );
}