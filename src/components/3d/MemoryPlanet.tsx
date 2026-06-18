"use client";
import { useRef, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { MemoryPlanet as PlanetType } from "./universe-config";

type Props = {
  planet: PlanetType;
  onClick: () => void;
  hovered: boolean;
  onHover: (v: boolean) => void;
};

export default function MemoryPlanet({ planet, onClick, hovered, onHover }: Props) {
  const orbitRef = useRef<THREE.Group>(null);
  const planetRef = useRef<THREE.Mesh>(null);
  const ringRef = useRef<THREE.Mesh>(null);
  const labelRef = useRef<THREE.Mesh>(null);

  const planetMat = useMemo(() =>
    new THREE.MeshStandardMaterial({
      color: planet.color, roughness: 0.4, metalness: 0.5,
      emissive: planet.color, emissiveIntensity: 0.4 * planet.emotionIntensity,
    }), [planet.color, planet.emotionIntensity]);

  const ringMat = useMemo(() =>
    new THREE.MeshBasicMaterial({
      color: planet.color, transparent: true, opacity: 0.12 * planet.emotionIntensity,
      side: THREE.DoubleSide, depthWrite: false,
    }), [planet.color, planet.emotionIntensity]);

  useFrame((_, delta) => {
    if (orbitRef.current) {
      orbitRef.current.rotation.y += delta * planet.orbitSpeed;
    }
    if (planetRef.current) {
      planetRef.current.rotation.y += delta * 0.3;
    }
    if (ringRef.current) {
      ringRef.current.rotation.x += delta * 0.2;
      ringRef.current.rotation.z += delta * 0.15;
    }
    if (labelRef.current) {
      labelRef.current.position.y = planet.size + 0.4 + Math.sin(Date.now() * 0.002) * 0.1;
    }
  });

  return (
    <group ref={orbitRef}>
      <group position={[planet.orbitRadius, 0, 0]}>
        {/* Planet */}
        <mesh
          ref={planetRef}
          onClick={(e) => { e.stopPropagation(); onClick(); }}
          onPointerOver={(e) => { e.stopPropagation(); onHover(true); }}
          onPointerOut={() => onHover(false)}
          material={planetMat}
          scale={hovered ? [1.15, 1.15, 1.15] : [1, 1, 1]}
        >
          <icosahedronGeometry args={[planet.size, 2]} />
        </mesh>

        {/* Orbit ring */}
        <mesh ref={ringRef} material={ringMat} rotation={[Math.PI / 2.5, 0, 0]}>
          <torusGeometry args={[planet.size * 1.5, 0.015, 16, 48]} />
        </mesh>

        {/* Floating label dot */}
        <mesh ref={labelRef} position={[0, planet.size + 0.4, 0]}>
          <sphereGeometry args={[0.06, 8, 8]} />
          <meshBasicMaterial color={planet.color} />
        </mesh>

        {/* Planet glow point light */}
        <pointLight color={planet.color} intensity={0.3 * planet.emotionIntensity} distance={2} decay={2} />
      </group>
    </group>
  );
}