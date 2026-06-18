"use client";
import { motion, AnimatePresence } from "framer-motion";

export default function DoorPortal({ dbp, drp, breathe, lightIntensity, active, done, fade }: {
  dbp: number; drp: number; breathe: number; lightIntensity: number; active: boolean; done: boolean; fade: boolean;
}) {
  const bi = 0.75 + lightIntensity * 0.25;
  return (
    <AnimatePresence>
      {((active || done) && !fade) && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 flex items-center justify-center pointer-events-none" style={{ perspective: "900px" }}>
          {/* Build stage: energy anchors + beams */}
          {active && !done && (
            <>
              {[{ l: "calc(50% - 80px)", t: "calc(50% - 170px)" }, { l: "calc(50% + 80px)", t: "calc(50% - 170px)" }, { l: "calc(50% - 80px)", t: "calc(50% + 170px)" }, { l: "calc(50% + 80px)", t: "calc(50% + 170px)" }].map((p, i) => (
                <motion.div key={"da"+i} initial={{ opacity: 0, scale: 0 }} animate={{ opacity: dbp > 0.25 ? 0.9 * bi : 0, scale: Math.min(dbp * 4, 1) }} style={{ position: "absolute", left: p.l, top: p.t, width: 12, height: 12, borderRadius: "50%", background: "rgba(255,200,110,0.9)", boxShadow: "0 0 24px 8px rgba(255,180,90,0.8), 0 0 48px 16px rgba(255,160,70,0.4)", filter: "blur(1px)" }} />
              ))}
              <motion.div initial={{ scaleX: 0, opacity: 0 }} animate={{ scaleX: dbp > 0.15 ? Math.min((dbp - 0.15) / 0.35, 1) : 0, opacity: (dbp > 0.15 ? 1 : 0) * bi }} style={{ position: "absolute", top: "calc(50% - 172px)", left: "calc(50% - 72px)", width: 144, height: 3, transformOrigin: "left center", background: "linear-gradient(90deg, rgba(255,180,90,0.8), rgba(255,210,140,0.9), rgba(255,180,90,0.8))", boxShadow: "0 0 20px rgba(255,170,80,0.6), 0 0 40px rgba(255,150,60,0.3)", filter: "blur(0.5px)" }} />
              <motion.div initial={{ scaleY: 0, opacity: 0 }} animate={{ scaleY: dbp > 0.3 ? Math.min((dbp - 0.3) / 0.35, 1) : 0, opacity: (dbp > 0.3 ? 1 : 0) * bi }} style={{ position: "absolute", top: "calc(50% - 170px)", left: "calc(50% - 74px)", width: 3, height: 340, transformOrigin: "top center", background: "linear-gradient(180deg, rgba(255,180,90,0.8), rgba(255,210,140,0.9), rgba(255,180,90,0.8))", boxShadow: "0 0 18px rgba(255,170,80,0.6), 0 0 36px rgba(255,150,60,0.3)", filter: "blur(0.5px)" }} />
              <motion.div initial={{ scaleY: 0, opacity: 0 }} animate={{ scaleY: dbp > 0.45 ? Math.min((dbp - 0.45) / 0.35, 1) : 0, opacity: (dbp > 0.45 ? 1 : 0) * bi }} style={{ position: "absolute", top: "calc(50% - 170px)", left: "calc(50% + 72px)", width: 3, height: 340, transformOrigin: "top center", background: "linear-gradient(180deg, rgba(255,180,90,0.8), rgba(255,210,140,0.9), rgba(255,180,90,0.8))", boxShadow: "0 0 18px rgba(255,170,80,0.6), 0 0 36px rgba(255,150,60,0.3)", filter: "blur(0.5px)" }} />
              <motion.div initial={{ scaleX: 0, opacity: 0 }} animate={{ scaleX: dbp > 0.6 ? Math.min((dbp - 0.6) / 0.35, 1) : 0, opacity: (dbp > 0.6 ? 1 : 0) * bi }} style={{ position: "absolute", top: "calc(50% + 170px)", left: "calc(50% - 72px)", width: 144, height: 3, transformOrigin: "left center", background: "linear-gradient(90deg, rgba(255,180,90,0.8), rgba(255,210,140,0.9), rgba(255,180,90,0.8))", boxShadow: "0 0 20px rgba(255,170,80,0.6), 0 0 40px rgba(255,150,60,0.3)", filter: "blur(0.5px)" }} />
            </>
          )}
          {/* Breathing glow */}
          {done && (
            <>
              <div style={{ position: "absolute", width: 180, height: 380, borderRadius: "16px", background: "radial-gradient(ellipse at center, rgba(255,185,90," + (0.2 + breathe * 0.15) * bi + "), transparent 68%)", filter: "blur(" + (18 + breathe * 8) + "px)", transform: "scale(" + (0.95 + breathe * 0.08) + ")", opacity: (0.5 + breathe * 0.4) * bi }} />
              <div style={{ position: "absolute", width: 100, height: 280, borderRadius: "8px", background: "radial-gradient(ellipse at center, rgba(255,220,140," + (0.3 + breathe * 0.25) * bi + "), rgba(255,170,80," + (0.15 + breathe * 0.1) * bi + "), transparent 65%)", filter: "blur(" + (4 + breathe * 3) + "px)", opacity: (0.7 + breathe * 0.25) * bi }} />
              <div style={{ position: "absolute", width: 3, height: 240, borderRadius: "2px", background: "linear-gradient(180deg, transparent 5%, rgba(255,230,160,0.9), rgba(255,200,120,0.8), rgba(255,230,160,0.9), transparent 95%)", boxShadow: "0 0 " + (14 + breathe * 10) + "px rgba(255,200,100," + (0.5 + breathe * 0.4) * bi + "), 0 0 " + (40 + breathe * 24) + "px rgba(255,170,80," + (0.25 + breathe * 0.2) * bi + ")", filter: "blur(0.5px)", opacity: (0.7 + breathe * 0.3) * bi }} />
              <motion.div initial={{ x: 0, opacity: 0.4 }} animate={{ x: -(22 + breathe * 6), opacity: (0.4 + breathe * 0.15) * bi }} style={{ position: "absolute", width: 48, height: 270, borderRadius: "6px 0 0 6px", background: "linear-gradient(180deg, rgba(15,12,35,0.92) 0%, rgba(20,16,42,0.88) 50%, rgba(15,12,35,0.92) 100%)", borderRight: "1px solid rgba(200,155,95,0.2)", backdropFilter: "blur(3px)" }} />
              <motion.div initial={{ x: 0, opacity: 0.4 }} animate={{ x: 22 + breathe * 6, opacity: (0.4 + breathe * 0.15) * bi }} style={{ position: "absolute", width: 48, height: 270, borderRadius: "0 6px 6px 0", background: "linear-gradient(180deg, rgba(15,12,35,0.92) 0%, rgba(20,16,42,0.88) 50%, rgba(15,12,35,0.92) 100%)", borderLeft: "1px solid rgba(200,155,95,0.2)", backdropFilter: "blur(3px)" }} />
              {/* Characters */}
              <div style={{ position: "absolute", bottom: "27%", display: "flex", opacity: Math.min(drp * 0.8, 1) * bi, filter: "drop-shadow(0 0 " + (10 + drp * 14) + "px rgba(255,190,100," + (0.2 + drp * 0.3) * bi + "))" }}>
                <svg width="56" height="126" viewBox="0 0 80 180"><ellipse cx="40" cy="26" rx="12" ry="16" fill="rgba(6,5,14,0.92)"/><path d="M28 42 Q28 38 40 38 Q52 38 52 42 L55 110 L46 110 L42 75 L38 75 L34 110 L25 110 Z" fill="rgba(6,5,14,0.92)"/><path d="M28 48 Q22 70 26 78" stroke="rgba(6,5,14,0.92)" strokeWidth="7" strokeLinecap="round" fill="none"/><path d="M52 48 Q58 65 55 85" stroke="rgba(6,5,14,0.92)" strokeWidth="7" strokeLinecap="round" fill="none"/><path d="M34 110 L30 168 L24 168" stroke="rgba(6,5,14,0.92)" strokeWidth="9" strokeLinecap="round" fill="none"/><path d="M46 110 L50 168 L56 168" stroke="rgba(6,5,14,0.92)" strokeWidth="9" strokeLinecap="round" fill="none"/><path d="M28 42 Q28 38 40 38 Q50 38 52 42 L55 110" stroke={"rgba(255,200,120,"+(0.15+drp*0.25)+")"} strokeWidth="1.5" fill="none"/></svg>
                <svg width="28" height="70" viewBox="0 0 40 100" style={{ marginLeft: -4 }}><ellipse cx="20" cy="16" rx="9" ry="11" fill="rgba(6,5,14,0.92)"/><path d="M13 27 Q13 25 20 25 Q27 25 27 27 L29 68 L24 68 L22 50 L18 50 L16 68 L11 68 Z" fill="rgba(6,5,14,0.92)"/><path d="M13 32 Q8 48 10 55" stroke="rgba(6,5,14,0.92)" strokeWidth="5" strokeLinecap="round" fill="none"/><path d="M27 30 Q32 44 30 55" stroke="rgba(6,5,14,0.92)" strokeWidth="5" strokeLinecap="round" fill="none"/><path d="M16 68 L14 95 L10 95" stroke="rgba(6,5,14,0.92)" strokeWidth="6" strokeLinecap="round" fill="none"/><path d="M24 68 L26 95 L30 95" stroke="rgba(6,5,14,0.92)" strokeWidth="6" strokeLinecap="round" fill="none"/><ellipse cx="20" cy="16" rx="9" ry="11" fill="none" stroke={"rgba(255,200,120,"+(0.08+drp*0.18)+")"} strokeWidth="1"/></svg>
              </div>
            </>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
