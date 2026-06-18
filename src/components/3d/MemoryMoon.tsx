"use client";
import { useRef, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { U } from "./universe-config";

export default function MemoryMoon() {
  const moonRef = useRef<THREE.Mesh>(null);
  const auraRef = useRef<THREE.Mesh>(null);

  const moonMat = useMemo(() =>
    new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uColor1: { value: new THREE.Color(U.moonInner) }, uColor2: { value: new THREE.Color(U.moonGlow) } },
      vertexShader: `varying vec3 vNormal; varying vec3 vPos; void main() { vNormal = normalize(normalMatrix * normal); vPos = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `
        varying vec3 vNormal; varying vec3 vPos;
        uniform vec3 uColor1; uniform vec3 uColor2; uniform float uTime;
        void main() {
          float fresnel = pow(1.0 - abs(dot(vNormal, vec3(0.0,0.0,1.0))), 3.0);
          float pulse = 0.85 + 0.15 * sin(uTime * 0.6 + vPos.y * 3.0);
          vec3 col = mix(uColor1, uColor2, fresnel * pulse);
          float glow = 0.5 + 0.5 * sin(uTime * 0.4) * 0.3;
          gl_FragColor = vec4(col * (1.0 + glow * 0.4), 1.0);
        }
      `,
    }), []);

  useFrame((_, delta) => {
    if (moonRef.current) {
      (moonRef.current.material as THREE.ShaderMaterial).uniforms.uTime.value += delta;
    }
    if (auraRef.current) {
      const s = 1 + Math.sin(Date.now() * 0.0005) * 0.05;
      auraRef.current.scale.setScalar(s);
    }
  });

  return (
    <group position={[0, 0, 0]}>
      {/* Core Moon */}
      <mesh ref={moonRef} material={moonMat}>
        <sphereGeometry args={[U.moonRadius, 64, 64]} />
      </mesh>

      {/* Outer aura */}
      <mesh ref={auraRef} material={new THREE.MeshBasicMaterial({ color: U.moonGlow, transparent: true, opacity: 0.06, depthWrite: false })}>
        <sphereGeometry args={[U.moonRadius * 1.8, 32, 32]} />
      </mesh>

      {/* Point light from moon */}
      <pointLight color={U.moonGlow} intensity={3} distance={12} decay={2} />
      <pointLight color={U.moonInner} intensity={1.5} distance={6} decay={2.5} />
    </group>
  );
}