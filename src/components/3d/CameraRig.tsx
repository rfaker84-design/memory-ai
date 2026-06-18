"use client";
import { useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { CAMERA, TIMELINE } from "./scene-config";

type Props = { elapsed: number; totalDuration: number };

export default function CameraRig({ elapsed, totalDuration }: Props) {
  const { camera } = useThree();
  const targetRef = useRef(new THREE.Vector3(0, CAMERA.startY, 0));

  useFrame(() => {
    const t = Math.min(elapsed / totalDuration, 1);

    // Ease function: slow start, accelerate through gate, then ease
    const ease = t < 0.5
      ? 2 * t * t
      : -1 + (4 - 2 * t) * t;

    let z: number;
    let y: number;

    if (elapsed < TIMELINE.dollyStart) {
      // Hold position before dolly
      z = CAMERA.startZ;
      y = CAMERA.startY;
    } else if (elapsed < TIMELINE.passThrough) {
      // Dolly through gate
      const dollyT = (elapsed - TIMELINE.dollyStart) / (TIMELINE.passThrough - TIMELINE.dollyStart);
      const dEase = dollyT < 0.5 ? 2 * dollyT * dollyT : 1 - Math.pow(-2 * dollyT + 2, 2) / 2;
      z = THREE.MathUtils.lerp(CAMERA.startZ, CAMERA.endZ, dEase);
      y = THREE.MathUtils.lerp(CAMERA.startY, CAMERA.endY, dEase);
    } else {
      // Past gate — hold or slight overshoot
      z = CAMERA.endZ - Math.sin((elapsed - TIMELINE.passThrough) * 2) * 0.1;
      y = CAMERA.endY;
    }

    camera.position.set(0, y, z);
    camera.lookAt(0, 0.2, 0);
  });

  return null;
}