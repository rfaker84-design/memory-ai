"use client";
import { useMemo } from "react";
import { motion } from "framer-motion";
import type { WeatherProfile } from "../hooks/useEmotionWeather";

interface Props {
  weather: WeatherProfile;
  name: string;
}

/* ====================================================================
   Generates weather-specific particles
   ==================================================================== */
function generateParticles(weather: string, count: number) {
  return Array.from({ length: count }, (_, i) => {
    const s = ((i * 16807 + 1) % 2147483647) / 2147483647;
    const isRain = weather === "rainy";
    return {
      x: s * 100, y: s * 100,
      size: isRain ? 0.5 + s * 0.6 : 1 + s * 2.5,
      opacity: 0.04 + s * 0.16,
      duration: isRain ? 1.5 + s * 2 : 6 + s * 14,
      delay: s * 8,
      vy: isRain ? 15 + s * 25 : 0.5 + s * 2,
      vx: isRain ? (s - 0.5) * 0.8 : 0,
    };
  });
}

export default function EmotionWeatherBackground({ weather, name }: Props) {
  const p = weather.bgPalette;
  const particles = useMemo(() => generateParticles(weather.weather, weather.weather === "rainy" ? 80 : 35), [weather.weather]);

  const behavior = weather.lightBehavior;
  const pulseDuration = behavior === "pulse" ? 5 + (1 - weather.intensity) * 8 : 10;
  const flickerDuration = behavior === "flicker" ? 3 + (1 - weather.intensity) * 2 : 8;

  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden" style={{ background: p.bg }}>
      {/* ================================================================
          Central bloom
          ================================================================ */}
      <motion.div
        animate={{
          opacity: behavior === "pulse"
            ? [0.1, 0.22 + weather.intensity * 0.15, 0.1]
            : behavior === "flicker"
            ? [0.06, 0.16, 0.04, 0.14, 0.06]
            : [0.1, 0.16, 0.1],
          scale: behavior === "drift" ? [1, 1.06, 1, 1.04, 1] : [1, 1.03, 1],
        }}
        transition={{
          duration: pulseDuration,
          repeat: Infinity,
          ease: "easeInOut",
        }}
        style={{
          position: "absolute", top: "42%", left: "50%",
          width: "65%", height: "55%",
          transform: "translate(-50%, -50%)",
          borderRadius: "50%",
          background: `radial-gradient(ellipse at center, ${p.bloom}${0.15 + weather.intensity * 0.2}) 0%, transparent 60%)`,
          filter: "blur(70px)",
        }}
      />

      {/* ================================================================
          Secondary bloom
          ================================================================ */}
      <motion.div
        animate={{
          opacity: [0.05, 0.12, 0.05],
          scale: [1, 1.04, 1],
        }}
        transition={{
          duration: pulseDuration + 4,
          repeat: Infinity,
          ease: "easeInOut",
          delay: 2,
        }}
        style={{
          position: "absolute", bottom: "18%", right: "8%",
          width: "45%", height: "40%",
          borderRadius: "50%",
          background: `radial-gradient(ellipse at center, ${p.bloom}0.12) 0%, transparent 60%)`,
          filter: "blur(55px)",
        }}
      />

      {/* ================================================================
          Fog layer
          ================================================================ */}
      <motion.div
        animate={{ opacity: [0.06, 0.14, 0.06] }}
        transition={{ duration: 12, repeat: Infinity, ease: "easeInOut" }}
        style={{
          position: "absolute", bottom: 0, left: 0, right: 0, height: "40%",
          background: `linear-gradient(to top, ${p.fog}${0.06 + weather.intensity * 0.1}) 0%, transparent 100%)`,
          filter: `blur(${20 + weather.intensity * 15}px)`,
        }}
      />

      {/* ================================================================
          Light particles / raindrops
          ================================================================ */}
      {particles.map((pt, i) => (
        <motion.div
          key={i}
          animate={{
            opacity: weather.weather === "rainy"
              ? [0, pt.opacity, 0]
              : [pt.opacity * 0.4, pt.opacity, pt.opacity * 0.4],
            y: weather.weather === "rainy" ? [0, pt.vy * 3] : [0, -pt.vy * 2, 0],
            x: weather.weather === "rainy" ? [0, pt.vx * 2] : 0,
          }}
          transition={{
            duration: pt.duration,
            repeat: Infinity,
            delay: pt.delay,
            ease: weather.weather === "rainy" ? "linear" : "easeInOut",
          }}
          style={{
            position: "absolute",
            left: `${pt.x}%`, top: `${weather.weather === "rainy" ? 0 : pt.y}%`,
            width: pt.size, height: weather.weather === "rainy" ? pt.size * 8 : pt.size,
            borderRadius: weather.weather === "rainy" ? 1 : "50%",
            background: p.particle,
            opacity: pt.opacity,
            boxShadow: weather.weather !== "rainy" ? `0 0 ${pt.size * 2}px ${p.particle}0.2)` : "none",
          }}
        />
      ))}

      {/* ================================================================
          Name — large whisper in background
          ================================================================ */}
      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 0.03 + weather.intensity * 0.03 }}
        transition={{ delay: 2, duration: 4 }}
        className="absolute inset-0 flex items-center justify-center select-none"
        style={{
          fontSize: "min(11vw, 110px)",
          fontWeight: 250,
          color: `rgba(255,255,255,${0.03 + weather.intensity * 0.03})`,
          letterSpacing: "0.18em",
        }}
      >
        {name}
      </motion.p>
    </div>
  );
}