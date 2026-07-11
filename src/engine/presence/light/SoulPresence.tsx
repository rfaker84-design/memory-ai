"use client";

import { forwardRef, useMemo, useRef } from "react";
import { AdditiveBlending, BufferAttribute, BufferGeometry, Color, Group, MeshBasicMaterial, PointsMaterial } from "three";
import { useFrame } from "@react-three/fiber";
import { DirectorConfig } from "../director/DirectorConfig";

type SoulPresenceProps = {
  opacity: { value: number };
  wireOpacity: { value: number };
};

export const SoulPresence = forwardRef<Group, SoulPresenceProps>(function SoulPresence({ opacity, wireOpacity }, ref) {
  const particleMaterialRef = useRef<PointsMaterial>(null);
  const wireMaterialRef = useRef<MeshBasicMaterial>(null);
  const config = DirectorConfig.soul;

  const geometry = useMemo(() => {
    const positions = new Float32Array(config.particleCount * 3);
    for (let i = 0; i < config.particleCount; i += 1) {
      const ix = i * 3;
      const y = -0.85 + (i / config.particleCount) * 2.15;
      const width = y > 0.7 ? 0.16 : y < -0.15 ? 0.36 : 0.52;
      positions[ix] = Math.sin(i * 2.11) * width * (0.35 + ((i * 7) % 11) / 18);
      positions[ix + 1] = y;
      positions[ix + 2] = Math.cos(i * 1.73) * 0.07;
    }
    const geometry = new BufferGeometry();
    geometry.setAttribute("position", new BufferAttribute(positions, 3));
    return geometry;
  }, [config.particleCount]);

  useFrame(({ clock }) => {
    if (particleMaterialRef.current) particleMaterialRef.current.opacity = opacity.value * 0.26;
    if (wireMaterialRef.current) wireMaterialRef.current.opacity = wireOpacity.value;
    const group = typeof ref === "object" ? ref?.current : null;
    if (group) group.rotation.y = Math.sin(clock.elapsedTime * 0.16) * 0.035;
  });

  return (
    <group ref={ref} scale={1}>
      <points geometry={geometry}>
        <pointsMaterial
          ref={particleMaterialRef}
          color={new Color(config.color)}
          size={0.024}
          transparent
          opacity={0}
          depthWrite={false}
          blending={AdditiveBlending}
        />
      </points>
      <mesh scale={[0.72, 1.58, 0.34]} position={[0, -0.04, 0]}>
        <sphereGeometry args={[0.56, 24, 18]} />
        <meshBasicMaterial
          ref={wireMaterialRef}
          color={config.color}
          transparent
          opacity={0}
          wireframe
          depthWrite={false}
        />
      </mesh>
      <mesh scale={[0.5, 1.4, 0.28]} position={[0, -0.08, 0]}>
        <sphereGeometry args={[0.62, 32, 24]} />
        <meshBasicMaterial color={config.purpleColor} transparent opacity={opacity.value * 0.035} depthWrite={false} />
      </mesh>
    </group>
  );
});
