"use client";

import { Canvas } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import { Color, Group, MeshStandardMaterial } from "three";
import { DirectorConfig } from "../director/DirectorConfig";
import { CameraController } from "../camera/CameraController";
import { LightController } from "../light/LightController";
import { PresenceParticles } from "../particle/PresenceParticles";
import { HeartCore } from "../light/HeartCore";
import { SoulPresence } from "../light/SoulPresence";
import { OverlayLogin } from "../overlay/OverlayLogin";
import { PresenceFog } from "./PresenceFog";
import { createPresenceTimeline } from "../timeline/PresenceTimeline";
import { usePresenceStore } from "../states/PresenceStore";
import "./presence-stage.css";

export function PresenceStage() {
  const overlayRef = useRef<HTMLDivElement>(null);
  const heartGroupRef = useRef<Group>(null);
  const soulGroupRef = useRef<Group>(null);
  const heartMaterialRef = useRef<MeshStandardMaterial | null>(null);
  const timelineRef = useRef<ReturnType<typeof createPresenceTimeline> | null>(null);
  const setState = usePresenceStore((store) => store.setState);

  const runtime = useMemo(() => ({
    cameraRig: { y: DirectorConfig.camera.position[1], z: DirectorConfig.camera.position[2] },
    heartGlow: { value: DirectorConfig.heart.glow.from },
    particleGather: { value: 0 },
    particleOpacity: { value: DirectorConfig.particle.opacity },
    soulOpacity: { value: 0 },
    soulWireOpacity: { value: 0 },
    fogDensity: { value: DirectorConfig.fog.density },
  }), []);

  useEffect(() => {
    if (!overlayRef.current || !heartGroupRef.current || !soulGroupRef.current || !heartMaterialRef.current) return;

    timelineRef.current = createPresenceTimeline({
      overlay: overlayRef.current,
      cameraRig: runtime.cameraRig,
      heart: {
        group: heartGroupRef.current,
        material: heartMaterialRef.current,
        glow: runtime.heartGlow,
      },
      particles: {
        gather: runtime.particleGather,
        opacity: runtime.particleOpacity,
      },
      soul: {
        group: soulGroupRef.current,
        opacity: runtime.soulOpacity,
        wireOpacity: runtime.soulWireOpacity,
      },
      fog: { density: runtime.fogDensity },
      setState,
    });

    return () => {
      timelineRef.current?.waiting.kill();
      timelineRef.current?.intro.kill();
    };
  }, [runtime, setState]);

  return (
    <main className="presence-stage" aria-label="MemoryAI Presence Engine V1">
      <Canvas
        className="presence-stage__canvas"
        dpr={DirectorConfig.stage.dpr}
        camera={{ fov: DirectorConfig.camera.fov, position: DirectorConfig.camera.position }}
        gl={{ antialias: true, alpha: false, powerPreference: "high-performance" }}
        onCreated={({ gl }) => gl.setClearColor(new Color(DirectorConfig.stage.clearColor), 1)}
      >
        <CameraController cameraRig={runtime.cameraRig} />
        <PresenceFog density={runtime.fogDensity} />
        <LightController />
        <PresenceParticles gather={runtime.particleGather} opacity={runtime.particleOpacity} />
        <SoulPresence ref={soulGroupRef} opacity={runtime.soulOpacity} wireOpacity={runtime.soulWireOpacity} />
        <HeartCore ref={heartGroupRef} materialRef={heartMaterialRef} />
      </Canvas>

      <div ref={overlayRef} className="presence-stage__overlay-shell">
        <OverlayLogin onStart={() => timelineRef.current?.playConnecting()} />
      </div>
    </main>
  );
}
