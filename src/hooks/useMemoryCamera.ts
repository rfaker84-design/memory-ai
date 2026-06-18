"use client";
import { useRef, useCallback, useEffect, useState } from "react";

export interface CameraState {
  zoom: number;       // 1.0 = normal, >1 = zoom in
  x: number;          // horizontal offset, 0=center
  y: number;          // vertical offset, 0=center
  rotateX: number;    // degrees
  rotateY: number;
  blur: number;       // px
  brightness: number; // 0-2
}

interface CameraTarget {
  zoom: number;
  x: number;
  y: number;
  rotateX: number;
  rotateY: number;
  blur: number;
  brightness: number;
  duration: number;   // ms to reach target
}

const DEFAULT_CAMERA: CameraState = {
  zoom: 1, x: 0, y: 0, rotateX: 0, rotateY: 0, blur: 0, brightness: 1,
};

export default function useMemoryCamera() {
  const [camera, setCamera] = useState<CameraState>(DEFAULT_CAMERA);
  const targetRef = useRef<CameraTarget>({ ...DEFAULT_CAMERA, duration: 2000 });
  const currentRef = useRef<CameraState>({ ...DEFAULT_CAMERA });
  const rafRef = useRef(0);
  const startTimeRef = useRef(0);
  const fromRef = useRef<CameraState>({ ...DEFAULT_CAMERA });
  const activeRef = useRef(false);

  const moveTo = useCallback((target: Partial<CameraState>, duration = 2000) => {
    fromRef.current = { ...currentRef.current };
    targetRef.current = {
      zoom: target.zoom ?? fromRef.current.zoom,
      x: target.x ?? fromRef.current.x,
      y: target.y ?? fromRef.current.y,
      rotateX: target.rotateX ?? fromRef.current.rotateX,
      rotateY: target.rotateY ?? fromRef.current.rotateY,
      blur: target.blur ?? fromRef.current.blur,
      brightness: target.brightness ?? fromRef.current.brightness,
      duration,
    };
    startTimeRef.current = performance.now();
  }, []);

  const reset = useCallback(() => {
    moveTo(DEFAULT_CAMERA, 1500);
  }, [moveTo]);

  useEffect(() => {
    activeRef.current = true;
    const tick = () => {
      if (!activeRef.current) return;
      const now = performance.now();
      const elapsed = now - startTimeRef.current;
      const t = targetRef.current;
      const dur = t.duration || 2000;
      const progress = Math.min(elapsed / dur, 1);
      // Ease in-out
      const eased = progress < 0.5
        ? 2 * progress * progress
        : 1 - Math.pow(-2 * progress + 2, 2) / 2;

      const f = fromRef.current;
      const c = currentRef.current;
      const lerp = (a: number, b: number) => a + (b - a) * eased;

      c.zoom = lerp(f.zoom, t.zoom);
      c.x = lerp(f.x, t.x);
      c.y = lerp(f.y, t.y);
      c.rotateX = lerp(f.rotateX, t.rotateX);
      c.rotateY = lerp(f.rotateY, t.rotateY);
      c.blur = lerp(f.blur, t.blur);
      c.brightness = lerp(f.brightness, t.brightness);

      setCamera({ ...c });
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => { activeRef.current = false; cancelAnimationFrame(rafRef.current); };
  }, []);

  return { camera, moveTo, reset };
}

// Ô¤Éè¾µÍ·ÒÆ¶¯
export const CAMERA_PRESETS = {
  wideShot:     { zoom: 0.85, y: 2, brightness: 0.9, blur: 0 } as Partial<CameraState>,
  closeUp:      { zoom: 1.4, brightness: 1.1, blur: 0 } as Partial<CameraState>,
  dollyLeft:    { zoom: 1.05, x: -4, rotateY: 2 } as Partial<CameraState>,
  dollyRight:   { zoom: 1.05, x: 4, rotateY: -2 } as Partial<CameraState>,
  tiltUp:       { zoom: 1.0, y: -5, rotateX: 3 } as Partial<CameraState>,
  dreamBlur:    { zoom: 1.1, blur: 3, brightness: 1.2 } as Partial<CameraState>,
  memoryFocus:  { zoom: 1.3, brightness: 0.85, blur: 0 } as Partial<CameraState>,
  pullBack:     { zoom: 0.7, brightness: 0.9 } as Partial<CameraState>,
};