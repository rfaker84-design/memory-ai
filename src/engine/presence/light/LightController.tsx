"use client";

import { Bloom, EffectComposer } from "@react-three/postprocessing";
import { DirectorConfig } from "../director/DirectorConfig";

export function LightController() {
  const { ambient, point, spot, bloom } = DirectorConfig.light;

  return (
    <>
      <ambientLight color={ambient.color} intensity={ambient.intensity} />
      <pointLight color={point.color} intensity={point.intensity} position={point.position} distance={point.distance} />
      <spotLight
        color={spot.color}
        intensity={spot.intensity}
        position={spot.position}
        angle={spot.angle}
        penumbra={spot.penumbra}
      />
      <EffectComposer enableNormalPass={false} multisampling={0}>
        <Bloom
          intensity={bloom.intensity}
          luminanceThreshold={bloom.luminanceThreshold}
          luminanceSmoothing={bloom.luminanceSmoothing}
        />
      </EffectComposer>
    </>
  );
}
