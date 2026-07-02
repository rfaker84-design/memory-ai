"use client";

import { forwardRef, useMemo } from "react";
import { Color, Group, MeshStandardMaterial } from "three";
import { DirectorConfig } from "../director/DirectorConfig";

type HeartCoreProps = {
  materialRef: React.MutableRefObject<MeshStandardMaterial | null>;
};

export const HeartCore = forwardRef<Group, HeartCoreProps>(function HeartCore({ materialRef }, ref) {
  const color = useMemo(() => new Color(DirectorConfig.heart.color), []);

  return (
    <group ref={ref} position={DirectorConfig.heart.position} scale={DirectorConfig.heart.scale}>
      <mesh>
        <sphereGeometry args={[0.34, 64, 64]} />
        <meshStandardMaterial
          ref={materialRef}
          color={color}
          emissive={color}
          emissiveIntensity={DirectorConfig.heart.glow.from}
          transparent
          opacity={DirectorConfig.heart.opacity}
          roughness={0.36}
          metalness={0.05}
        />
      </mesh>
      <mesh scale={[1.45, 1.12, 1.45]}>
        <sphereGeometry args={[0.37, 48, 48]} />
        <meshBasicMaterial color={color} transparent opacity={0.055} depthWrite={false} />
      </mesh>
    </group>
  );
});
