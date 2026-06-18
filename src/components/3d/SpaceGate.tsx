"use client";
import { useRef, useMemo } from "react";
import * as THREE from "three";
import { U } from "./universe-config";

type Props = { openProgress: number; glowIntensity: number; visible: boolean };

export default function SpaceGate({ openProgress, glowIntensity, visible }: Props) {
  const groupRef = useRef<THREE.Group>(null);
  if (!visible) return null;

  const frameMat = useMemo(() =>
    new THREE.MeshStandardMaterial({ color: U.moonGlow, roughness: 0.3, metalness: 0.9, emissive: U.moonGlow, emissiveIntensity: 0.5 }), []);
  const doorMat = useMemo(() =>
    new THREE.MeshStandardMaterial({ color: U.moonGlow, roughness: 0.2, metalness: 0.7, emissive: U.moonGlow, emissiveIntensity: 2.0 }), []);
  const gapMat = useMemo(() =>
    new THREE.MeshBasicMaterial({ color: U.moonInner, transparent: true, opacity: 0.9 }), []);

  const gw = 2.2; const gh = 3.2; const gd = 0.1; const fw = 0.07;

  return (
    <group ref={groupRef} position={[0, 0.3, -3]}>
      {/* Frame */}
      <mesh position={[0, gh/2, 0]} material={frameMat}><boxGeometry args={[gw+fw*2, fw, gd]} /></mesh>
      <mesh position={[0, -gh/2, 0]} material={frameMat}><boxGeometry args={[gw+fw*2, fw, gd]} /></mesh>
      <mesh position={[-(gw/2+fw/2), 0, 0]} material={frameMat}><boxGeometry args={[fw, gh, gd]} /></mesh>
      <mesh position={[(gw/2+fw/2), 0, 0]} material={frameMat}><boxGeometry args={[fw, gh, gd]} /></mesh>

      {/* Doors sliding open */}
      <group position={[-(gw/4)*openProgress, 0, 0]}>
        <mesh position={[-gw/4, 0, 0.01]} material={doorMat}><boxGeometry args={[gw/2-0.02, gh-0.04, gd*0.6]} /></mesh>
      </group>
      <group position={[(gw/4)*openProgress, 0, 0]}>
        <mesh position={[gw/4, 0, 0.01]} material={doorMat}><boxGeometry args={[gw/2-0.02, gh-0.04, gd*0.6]} /></mesh>
      </group>

      {/* Gap light */}
      <mesh position={[0, 0, gd*0.3]} material={gapMat} scale={[0.02, gh*0.85, 1]}><planeGeometry /></mesh>

      {/* Door lights */}
      <pointLight position={[0, 0, 1]} color={U.moonGlow} intensity={glowIntensity*2.5} distance={6} decay={2} />
      <pointLight position={[0, gh*0.4, 1]} color={U.moonInner} intensity={glowIntensity*1.2} distance={4} decay={2} />
    </group>
  );
}