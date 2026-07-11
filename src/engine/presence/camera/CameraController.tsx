"use client";

import { useFrame, useThree } from "@react-three/fiber";
import { useEffect } from "react";
import { DirectorConfig } from "../director/DirectorConfig";

type CameraControllerProps = {
  cameraRig: { y: number; z: number };
};

export function CameraController({ cameraRig }: CameraControllerProps) {
  const { camera } = useThree();

  useEffect(() => {
    camera.position.set(...DirectorConfig.camera.position);
    if ("fov" in camera) {
      camera.fov = DirectorConfig.camera.fov;
      camera.updateProjectionMatrix();
    }
  }, [camera]);

  useFrame(() => {
    camera.position.y = cameraRig.y;
    camera.position.z = cameraRig.z;
    camera.lookAt(0, 0, 0);
    if ("fov" in camera) camera.updateProjectionMatrix();
  });

  return null;
}
