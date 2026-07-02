"use client";

import { useFrame, useThree } from "@react-three/fiber";
import { DirectorConfig } from "../director/DirectorConfig";

type PresenceFogProps = {
  density: { value: number };
};

export function PresenceFog({ density }: PresenceFogProps) {
  const scene = useThree((state) => state.scene);

  useFrame(() => {
    if (scene.fog && "density" in scene.fog) scene.fog.density = density.value;
  });

  return <fogExp2 attach="fog" args={[DirectorConfig.stage.fogColor, DirectorConfig.stage.fogDensity]} />;
}
