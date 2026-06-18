"use client";
import { useRef, useCallback, useEffect, useState } from "react";

export default function useLightField() {
  const targetRef = useRef({ x: 0.5, y: 0.4 });
  const currentRef = useRef({ x: 0.5, y: 0.4 });
  const [intensity, setIntensity] = useState(0.5);
  const rafRef = useRef(0);
  const activeRef = useRef(false);

  const onMove = useCallback((e: MouseEvent | TouchEvent) => {
    let cx: number, cy: number;
    if ("touches" in e) {
      if (e.touches.length === 0) return;
      cx = e.touches[0].clientX; cy = e.touches[0].clientY;
    } else { cx = e.clientX; cy = e.clientY; }
    targetRef.current.x = cx / window.innerWidth;
    targetRef.current.y = cy / window.innerHeight;
  }, []);

  useEffect(() => {
    activeRef.current = true;
    const tick = () => {
      if (!activeRef.current) return;
      const t = targetRef.current, c = currentRef.current;
      c.x += (t.x - c.x) * 0.06; c.y += (t.y - c.y) * 0.06;
      setIntensity(Math.max(0, 1 - Math.hypot(c.x - 0.5, c.y - 0.4) * 1.5));
      rafRef.current = requestAnimationFrame(tick);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("touchmove", onMove, { passive: true });
    rafRef.current = requestAnimationFrame(tick);
    return () => { activeRef.current = false; cancelAnimationFrame(rafRef.current);
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("touchmove", onMove); };
  }, [onMove]);
  return { intensity, current: currentRef };
}
