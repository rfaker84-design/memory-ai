"use client";
import { useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";

const COUNT = 600;
const SPHERE_RADIUS = 20;

export default function StarField3D() {
  const meshRef = useRef<THREE.Points>(null);
  const { positions, colors, sizes } = useMemo(() => {
    const pos = new Float32Array(COUNT * 3);
    const col = new Float32Array(COUNT * 3);
    const siz = new Float32Array(COUNT);
    for (let i = 0; i < COUNT; i++) {
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      const r = SPHERE_RADIUS * (0.7 + Math.random() * 0.3);
      pos[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      pos[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      pos[i * 3 + 2] = r * Math.cos(phi);
      const warm = Math.random() > 0.65;
      col[i * 3] = warm ? 1.0 : 0.7;
      col[i * 3 + 1] = warm ? 0.75 : 0.75;
      col[i * 3 + 2] = warm ? 0.55 : 0.85;
      siz[i] = 0.02 + Math.random() * 0.06;
    }
    return { positions: pos, colors: col, sizes: siz };
  }, []);

  useFrame((_, delta) => {
    if (meshRef.current) meshRef.current.rotation.y += delta * 0.015;
  });

  return (
    <points ref={meshRef}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
        <bufferAttribute attach="attributes-color" args={[colors, 3]} />
        <bufferAttribute attach="attributes-size" args={[sizes, 1]} />
      </bufferGeometry>
      <pointsMaterial size={0.04} vertexColors sizeAttenuation transparent opacity={0.8} depthWrite={false} blending={THREE.AdditiveBlending} />
    </points>
  );
}