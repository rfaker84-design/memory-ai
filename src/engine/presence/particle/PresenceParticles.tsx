"use client";

import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import { AdditiveBlending, BufferAttribute, BufferGeometry, Color, Points, PointsMaterial } from "three";
import { DirectorConfig } from "../director/DirectorConfig";

type PresenceParticlesProps = {
  gather: { value: number };
  opacity: { value: number };
};

export function PresenceParticles({ gather, opacity }: PresenceParticlesProps) {
  const pointsRef = useRef<Points>(null);
  const materialRef = useRef<PointsMaterial>(null);
  const config = DirectorConfig.particle;

  const { geometry, base, target, speeds } = useMemo(() => {
    const base = new Float32Array(config.count * 3);
    const target = new Float32Array(config.count * 3);
    const speeds = new Float32Array(config.count);
    const positions = new Float32Array(config.count * 3);

    for (let i = 0; i < config.count; i += 1) {
      const ix = i * 3;
      const u = (i * 12.9898) % 1;
      const v = (i * 78.233) % 1;
      const w = (i * 37.719) % 1;
      base[ix] = (Math.sin(i * 17.17) * 0.5 + u - 0.5) * config.spread[0];
      base[ix + 1] = (Math.cos(i * 11.31) * 0.5 + v - 0.5) * config.spread[1];
      base[ix + 2] = (Math.sin(i * 5.91) * 0.5 + w - 0.5) * config.spread[2];

      const bodyY = i % 5 === 0 ? 0.72 : i % 3 === 0 ? -0.34 : 0.12;
      const bodyWidth = bodyY > 0.5 ? 0.16 : bodyY < -0.2 ? 0.38 : 0.5;
      target[ix] = Math.sin(i * 2.41) * bodyWidth;
      target[ix + 1] = bodyY + Math.cos(i * 1.77) * 0.22;
      target[ix + 2] = Math.sin(i * 3.13) * 0.08;

      positions[ix] = base[ix];
      positions[ix + 1] = base[ix + 1];
      positions[ix + 2] = base[ix + 2];
      speeds[i] = 0.45 + ((i * 13) % 17) / 30;
    }

    const geometry = new BufferGeometry();
    geometry.setAttribute("position", new BufferAttribute(positions, 3));
    return { geometry, base, target, speeds };
  }, [config.count, config.spread]);

  useFrame(({ clock }) => {
    const positions = geometry.attributes.position as BufferAttribute;
    const array = positions.array as Float32Array;
    const time = clock.elapsedTime;

    for (let i = 0; i < config.count; i += 1) {
      const ix = i * 3;
      const drift = Math.sin(time * config.speed * 9 * speeds[i] + i) * 0.035;
      const g = gather.value;
      array[ix] = base[ix] * (1 - g) + target[ix] * g + drift;
      array[ix + 1] = base[ix + 1] * (1 - g) + target[ix + 1] * g + Math.cos(time * config.speed * 7 * speeds[i] + i) * 0.025;
      array[ix + 2] = base[ix + 2] * (1 - g) + target[ix + 2] * g;
    }

    positions.needsUpdate = true;
    if (materialRef.current) materialRef.current.opacity = opacity.value;
  });

  return (
    <points ref={pointsRef} geometry={geometry}>
      <pointsMaterial
        ref={materialRef}
        color={new Color(config.color)}
        size={config.size}
        transparent
        opacity={config.opacity}
        depthWrite={false}
        blending={AdditiveBlending}
      />
    </points>
  );
}
