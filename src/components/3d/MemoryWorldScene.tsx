"use client";
import { useState, useMemo, Suspense } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { EffectComposer, Bloom } from "@react-three/postprocessing";
import * as THREE from "three";
import StarField3D from "./StarField3D";
import MemoryIsland from "./MemoryIsland";
import RelationshipLines from "./RelationshipLines";
import { WORLD, DEFAULT_MEMORIES, RELATIONS, type MemoryEntity } from "./world-config";

function LoadingFallback() {
  return (
    <mesh>
      <sphereGeometry args={[0.5, 16, 16]} />
      <meshStandardMaterial color="#FFB37C" emissive="#FFB37C" emissiveIntensity={0.5} wireframe />
    </mesh>
  );
}

function WorldContent({ entities, onSelect }: { entities: MemoryEntity[]; onSelect: (id: string) => void }) {
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  return (
    <>
      <color attach="background" args={[WORLD.bg]} />
      <fog attach="fog" args={[WORLD.bg, WORLD.fogNear, WORLD.fogFar]} />

      <ambientLight intensity={0.15} color="#FFD2A6" />
      <directionalLight position={[5, 8, 5]} intensity={0.3} color="#FFF3E8" />

      <StarField3D />

      {/* Ground — subtle reflection disc */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -2.2, 0]} receiveShadow>
        <circleGeometry args={[16, 64]} />
        <meshStandardMaterial color={WORLD.bg} roughness={0.95} metalness={0.05} transparent opacity={0.6} />
      </mesh>

      {/* Memory Islands */}
      {entities.map((entity) => {
        const x = Math.cos(entity.orbitAngle) * entity.orbitRadius;
        const z = Math.sin(entity.orbitAngle) * entity.orbitRadius;
        return (
          <Suspense key={entity.id} fallback={<LoadingFallback />}>
            <MemoryIsland
              entity={entity}
              position={[x, 0, z]}
              onClick={() => onSelect(entity.id)}
              hovered={hoveredId === entity.id}
              onHover={(v) => setHoveredId(v ? entity.id : null)}
            />
          </Suspense>
        );
      })}

      {/* Relationship Lines */}
      <RelationshipLines entities={entities} relations={RELATIONS} />

      {/* Center glow */}
      <pointLight position={[0, 1, 0]} color="#FFD2A6" intensity={0.8} distance={15} decay={2} />

      {/* Orbit Controls */}
      <OrbitControls
        enableDamping
        dampingFactor={0.08}
        minDistance={4}
        maxDistance={22}
        maxPolarAngle={Math.PI * 0.7}
        target={[0, 0.2, 0]}
      />

      {/* Bloom Postprocessing */}
      <EffectComposer>
        <Bloom luminanceThreshold={0.15} luminanceSmoothing={0.9} intensity={0.7} radius={0.6} mipmapBlur />
      </EffectComposer>
    </>
  );
}

type Props = {
  memories?: MemoryEntity[];
  onSelectMemory: (id: string) => void;
};

export default function MemoryWorldScene({ memories, onSelectMemory }: Props) {
  const entities = useMemo(() => memories && memories.length > 0 ? memories : DEFAULT_MEMORIES, [memories]);

  return (
    <Canvas
      camera={{ position: [0, 4, 14], fov: 50, near: 0.1, far: 50 }}
      dpr={[1, 2]}
      gl={{ antialias: true, toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 1.1 }}
      style={{ position: "fixed", inset: 0 }}
    >
      <WorldContent entities={entities} onSelect={onSelectMemory} />
    </Canvas>
  );
}