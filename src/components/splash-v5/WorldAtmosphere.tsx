"use client";
import { useMemo } from "react";
import { motion } from "framer-motion";
import type { Weather, TimeOfDay, WorldType } from "../../lib/world-types";
import { ATMOSPHERE_RENDER, WORLD_STRUCTURES, TIME_FILTERS } from "../../lib/world-types";

function sr(s: number) { let v = s; return () => { v = (v * 16807) % 2147483647; return v / 2147483647; }; }

interface Props {
  weather: Weather;
  timeOfDay: TimeOfDay;
  worldType: WorldType;
  intensity: number;
  active: boolean;
}

export default function WorldAtmosphere({ weather, timeOfDay, worldType, intensity, active }: Props) {
  const atmos = ATMOSPHERE_RENDER[weather];
  const structure = WORLD_STRUCTURES[worldType];
  const timeFilter = TIME_FILTERS[timeOfDay];

  const particles = useMemo(() => {
    const count = weather === "rainy" ? 80 : weather === "snowy" ? 60 : weather === "foggy" ? 30 : 40;
    return Array.from({ length: count }, (_, i) => {
      const r = sr(i * 199 + 11);
      return {
        x: r() * 100,
        y: r() * 100,
        size: 1 + r() * (weather === "rainy" ? 8 : weather === "snowy" ? 4 : 3),
        speed: (0.3 + r() * 1.4) * atmos.particleSpeed,
        delay: r() * 4,
        opacity: 0.1 + r() * 0.5,
      };
    });
  }, [weather, atmos.particleSpeed]);

  const dirY = atmos.particleDirection === "up" ? -1 : atmos.particleDirection === "down" ? 1 : 0;
  const dirX = atmos.particleDirection === "drift" ? 1 : 0;

  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden">
      {/* Base gradient */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: atmos.bgGradient,
          opacity: active ? 1 : 0,
          transition: "opacity 1s ease",
        }}
      />

      {/* Time of day overlay */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: timeFilter.colorTemp,
          opacity: active ? timeFilter.shadowOpacity * intensity : 0,
          transition: "opacity 1.5s ease",
        }}
      />

      {/* Depth layers (parallax geometry) */}
      {structure.depthLayers.map((layer, i) => (
        <motion.div
          key={"dl" + i}
          animate={{
            scale: layer.scale * (0.9 + intensity * 0.2),
            opacity: layer.opacity * intensity,
          }}
          transition={{ duration: 2, ease: "easeOut" }}
          style={{
            position: "absolute",
            inset: 0,
            background: `radial-gradient(ellipse at ${structure.vanishingPoint.x}% ${structure.vanishingPoint.y}%, ${layer.color}0.4) 0%, transparent 65%)`,
            filter: `blur(${atmos.blur + i * 2}px)`,
            transformOrigin: `${structure.vanishingPoint.x}% ${structure.vanishingPoint.y}%`,
          }}
        />
      ))}

      {/* Light bloom */}
      <motion.div
        animate={{
          opacity: active ? atmos.lightIntensity * intensity * 0.5 : 0,
        }}
        transition={{ duration: 2 }}
        style={{
          position: "absolute",
          top: `${structure.vanishingPoint.y - 8}%`,
          left: `${structure.vanishingPoint.x - 10}%`,
          width: "20%",
          height: "25%",
          background: `radial-gradient(ellipse at center, ${atmos.lightColor}0.6), transparent 70%)`,
          filter: `blur(${20 + atmos.blur * 10}px)`,
        }}
      />

      {/* Particles */}
      {particles.map((p, i) => (
        <motion.div
          key={"wp" + i}
          initial={{
            x: p.x + "%",
            y: p.y + "%",
            opacity: 0,
          }}
          animate={{
            x: (p.x + dirX * 15 * p.speed) + "%",
            y: (p.y + dirY * 40 * p.speed) + "%",
            opacity: [0, p.opacity * intensity, p.opacity * intensity * 0.7, 0],
          }}
          transition={{
            duration: 3 + p.speed * 8,
            delay: p.delay,
            ease: "linear",
            repeat: Infinity,
          }}
          style={{
            position: "absolute",
            width: p.size,
            height: p.size,
            borderRadius: weather === "rainy" ? "50% 50% 0 50%" : "50%",
            background: `${atmos.particleColor}${p.opacity})`,
            filter: `blur(${weather === "foggy" ? p.size * 1.5 : 0}px)`,
          }}
        />
      ))}

      {/* Vignette */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: `radial-gradient(ellipse at 50% 40%, transparent 55%, ${atmos.overlayColor})`,
          opacity: active ? 1 : 0,
          transition: "opacity 1s ease",
        }}
      />
    </div>
  );
}