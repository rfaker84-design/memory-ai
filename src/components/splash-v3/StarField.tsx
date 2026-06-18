"use client";
import { useMemo } from "react";
import { motion } from "framer-motion";

function sr(s: number) { let v = s; return () => { v = (v * 16807) % 2147483647; return v / 2147483647; }; }

export default function StarField({ progress }: { progress: number }) {
  const stars = useMemo(() => {
    const f = [], m = [], n: { x: number; y: number; s: number; d: number; br: number }[] = [];
    for (let i = 0; i < 120; i++) {
      const r = sr(i * 199); const ly = i < 60 ? "f" : i < 96 ? "m" : "n";
      const x = r() * 100, y = r() * 45;
      if (ly === "f") f.push({ x, y, s: 0.4 + r() * 0.9, d: r() * 3 });
      else if (ly === "m") m.push({ x, y, s: 0.8 + r() * 1.6, d: r() * 2.5 });
      else n.push({ x, y, s: 1.5 + r() * 2.5, d: r() * 1.5, br: r() * 0.5 + 0.3 });
    } return { f, m, n };
  }, []);

  return (
    <div className="absolute inset-0 pointer-events-none">
      <motion.div animate={{ opacity: progress < 0.3 ? progress / 0.3 : 1 }}>
        {stars.f.map((s, i) => (
          <div key={"sf"+i} style={{ position: "absolute", left: s.x + "%", top: s.y + "%", width: s.s, height: s.s, borderRadius: "50%", background: "rgba(180,190,210," + (0.15 + progress * 0.35) + ")", transform: "translateY(" + (progress * s.d * 2) + "px)", willChange: "transform, opacity" }} />
        ))}
      </motion.div>
      <motion.div animate={{ opacity: progress < 0.5 ? progress / 0.5 : 1 }}>
        {stars.m.map((s, i) => (
          <div key={"sm"+i} style={{ position: "absolute", left: s.x + "%", top: s.y + "%", width: s.s, height: s.s, borderRadius: "50%", background: "rgba(210,215,230," + (0.2 + progress * 0.45) + ")", boxShadow: "0 0 " + s.s + "px rgba(200,210,240,0.2)", transform: "translateY(" + (progress * s.d * 4) + "px)", willChange: "transform, opacity" }} />
        ))}
      </motion.div>
      <motion.div animate={{ opacity: progress < 0.6 ? progress / 0.6 : 1 }}>
        {stars.n.map((s, i) => (
          <div key={"sn"+i} style={{ position: "absolute", left: s.x + "%", top: s.y + "%", width: s.s, height: s.s, borderRadius: "50%", background: "rgba(255,245,215," + (0.3 + progress * 0.5) + ")", boxShadow: "0 0 " + (s.s * 2) + "px " + s.s + "px rgba(255,230,180," + s.br + ")", transform: "translateY(" + (progress * s.d * 6) + "px)", willChange: "transform, opacity" }} />
        ))}
      </motion.div>
    </div>
  );
}
