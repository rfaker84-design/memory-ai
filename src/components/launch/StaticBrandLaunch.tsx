"use client";

import Image from "next/image";
import { useEffect, useState } from "react";

import {
  BRAND_LAUNCH_EXIT_MS,
  BRAND_LAUNCH_HOLD_MS,
} from "./staticBrandLaunchPolicy";
import styles from "./StaticBrandLaunch.module.css";

type StaticBrandLaunchProps = {
  onComplete: () => void;
  ready: boolean;
};

export default function StaticBrandLaunch({ onComplete, ready }: StaticBrandLaunchProps) {
  const [minimumElapsed, setMinimumElapsed] = useState(false);
  const [exiting, setExiting] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => setMinimumElapsed(true), BRAND_LAUNCH_HOLD_MS);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!minimumElapsed || !ready) return;
    setExiting(true);
    const timer = window.setTimeout(onComplete, BRAND_LAUNCH_EXIT_MS);
    return () => window.clearTimeout(timer);
  }, [minimumElapsed, onComplete, ready]);

  return (
    <section className={`${styles.launch} ${exiting ? styles.exiting : ""}`} aria-label="忆见，忆一人 见一生">
      <Image
        alt=""
        aria-hidden="true"
        className={styles.background}
        fill
        priority
        sizes="100vw"
        src="/splash/owner-confirmed-warm-presence.png"
      />
      <div aria-hidden="true" className={styles.tone} />
      <div className={styles.content}>
        <h1 className={styles.brand}>忆见</h1>
        <p className={styles.tagline}>忆一人 见一生</p>
      </div>
    </section>
  );
}
