import type * as THREE from "three";

export type PresenceState = "WAITING" | "CONNECTING" | "AWAKENING" | "CREATING" | "GENERATING" | "REUNION";

export type PresenceTimelineTargets = {
  overlay: HTMLElement;
  cameraRig: { z: number };
  heart: {
    group: THREE.Group;
    material: THREE.MeshStandardMaterial;
    glow: { value: number };
  };
  particles: {
    gather: { value: number };
    opacity: { value: number };
  };
  soul: {
    group: THREE.Group;
    opacity: { value: number };
    wireOpacity: { value: number };
  };
  fog: { density: { value: number } };
  setState: (state: PresenceState) => void;
};
