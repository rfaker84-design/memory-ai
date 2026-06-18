"use client";
import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { MemoryEntity } from "./world-config";

type Props = {
  entities: MemoryEntity[];
  relations: [string, string, number][];
};

function worldPos(entity: MemoryEntity): THREE.Vector3 {
  const r = entity.orbitRadius;
  const a = entity.orbitAngle;
  return new THREE.Vector3(Math.cos(a) * r, 0, Math.sin(a) * r);
}

export default function RelationshipLines({ entities, relations }: Props) {
  const linesRef = useRef<THREE.Group>(null);
  const entityMap = useMemo(() => {
    const m = new Map<string, MemoryEntity>();
    entities.forEach(e => m.set(e.id, e));
    return m;
  }, [entities]);

  const lineObjects = useMemo(() => {
    const mat = new THREE.LineBasicMaterial({
      color: "#FFD2A6", transparent: true, opacity: 0.2,
      depthWrite: false, blending: THREE.AdditiveBlending,
    });
    return relations.map(([a, b, strength]) => {
      const ea = entityMap.get(a);
      const eb = entityMap.get(b);
      if (!ea || !eb) return null;
      const pa = worldPos(ea);
      const pb = worldPos(eb);
      const mid = new THREE.Vector3().addVectors(pa, pb).multiplyScalar(0.5);
      mid.y += 0.4 * strength;
      const curve = new THREE.QuadraticBezierCurve3(pa.clone(), mid, pb.clone());
      const pts = curve.getPoints(20);
      const geo = new THREE.BufferGeometry().setFromPoints(pts);
      return { line: new THREE.Line(geo, mat), strength };
    }).filter(Boolean) as { line: THREE.Line; strength: number }[];
  }, [entityMap, relations]);

  useFrame((_, delta) => {
    if (linesRef.current) {
      linesRef.current.children.forEach((child, i) => {
        const l = child as THREE.Line;
        const mat = l.material as THREE.LineBasicMaterial;
        if (mat) mat.opacity = 0.12 + Math.sin(Date.now() * 0.002 + i) * 0.06 + lineObjects[i].strength * 0.1;
      });
    }
  });

  return (
    <group ref={linesRef}>
      {lineObjects.map((lo, i) => (
        <primitive key={i} object={lo.line} />
      ))}
    </group>
  );
}