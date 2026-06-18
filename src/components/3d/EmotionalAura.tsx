"use client";
import { useRef, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

type Props = { intensity: number; color: string; position: [number, number, number] };

export default function EmotionalAura({ intensity, color, position }: Props) {
  const ringRef = useRef<THREE.Mesh>(null);
  const innerRef = useRef<THREE.Mesh>(null);

  const ringMat = useMemo(() =>
    new THREE.ShaderMaterial({
      uniforms: { uColor: { value: new THREE.Color(color) }, uIntensity: { value: intensity }, uTime: { value: 0 } },
      vertexShader: `
        varying vec2 vUv;
        void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
      `,
      fragmentShader: `
        varying vec2 vUv;
        uniform vec3 uColor;
        uniform float uIntensity;
        uniform float uTime;
        void main() {
          float dist = length(vUv - 0.5) * 2.0;
          float alpha = (1.0 - dist) * 0.25 * uIntensity;
          alpha *= 0.8 + 0.2 * sin(uTime * 1.5 + dist * 3.0);
          gl_FragColor = vec4(uColor, alpha);
        }
      `,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }), [color, intensity]);

  useFrame((_, delta) => {
    if (ringRef.current) {
      ringRef.current.rotation.y += delta * 0.15;
      ringRef.current.rotation.x += delta * 0.05;
      (ringRef.current.material as THREE.ShaderMaterial).uniforms.uTime.value += delta;
      const s = 0.8 + Math.sin(Date.now() * 0.001) * 0.2;
      ringRef.current.scale.setScalar(s);
    }
    if (innerRef.current) {
      const s2 = 0.6 + Math.sin(Date.now() * 0.0015 + 1) * 0.15;
      innerRef.current.scale.setScalar(s2);
      (innerRef.current.material as THREE.ShaderMaterial).uniforms.uTime.value += delta;
    }
  });

  return (
    <group position={position}>
      <mesh ref={ringRef} material={ringMat}>
        <ringGeometry args={[0.5, 0.7, 64]} />
      </mesh>
      <mesh ref={innerRef} material={ringMat} rotation={[Math.PI / 3, 0, 0]}>
        <ringGeometry args={[0.3, 0.45, 48]} />
      </mesh>
    </group>
  );
}