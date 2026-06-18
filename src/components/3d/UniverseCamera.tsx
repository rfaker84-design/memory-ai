"use client";
import { useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { U, TIMING, type UniverseState, type MemoryPlanet } from "./universe-config";

type Props = {
  state: UniverseState;
  elapsed: number;
  focusPlanet: MemoryPlanet | null;
};

export default function UniverseCamera({ state, elapsed, focusPlanet }: Props) {
  const { camera } = useThree();

  useFrame(() => {
    if (state === "SPLASH") {
      // Splash: push through gate
      if (elapsed < TIMING.pushThrough) {
        const t = Math.min(elapsed / TIMING.pushThrough, 1);
        const ease = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
        const z = THREE.MathUtils.lerp(U.cameraStartZ, 2, ease);
        camera.position.set(0, 0.5, z);
        camera.lookAt(0, 0.3, 0);
      } else {
        // Emerge into universe
        const t2 = Math.min((elapsed - TIMING.pushThrough) / (TIMING.enterUniverse - TIMING.pushThrough), 1);
        const ease = 1 - Math.pow(1 - t2, 3);
        const z = THREE.MathUtils.lerp(2, U.cameraWorldZ, ease);
        const y = THREE.MathUtils.lerp(0.5, 2.5, ease);
        camera.position.set(0, y, z);
        camera.lookAt(0, 0, 0);
      }
    } else if (state === "FOCUS" && focusPlanet) {
      // Focus: zoom into planet
      const angle = focusPlanet.orbitAngle + elapsed * focusPlanet.orbitSpeed * 0.3;
      const tx = Math.cos(angle) * focusPlanet.orbitRadius;
      const tz = Math.sin(angle) * focusPlanet.orbitRadius;
      const target = new THREE.Vector3(tx, 0.2, tz);
      const camTarget = new THREE.Vector3(tx, 1.5, tz + U.cameraFocusZ);
      camera.position.lerp(camTarget, 0.05);
      camera.lookAt(target.x, target.y, target.z);
    }
    // UNIVERSE state: handled by OrbitControls, no camera override needed
  });

  return null;
}