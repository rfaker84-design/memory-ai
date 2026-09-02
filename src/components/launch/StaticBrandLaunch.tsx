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
  const [backgroundReady, setBackgroundReady] = useState(false);
  const [exiting, setExiting] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => setMinimumElapsed(true), BRAND_LAUNCH_HOLD_MS);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!minimumElapsed || !ready || !backgroundReady) return;
    setExiting(true);
    const timer = window.setTimeout(onComplete, BRAND_LAUNCH_EXIT_MS);
    return () => window.clearTimeout(timer);
  }, [backgroundReady, minimumElapsed, onComplete, ready]);

  return (
    <section className={`${styles.launch} ${exiting ? styles.exiting : ""}`} aria-label="忆见，见一人 忆一生">
      <svg aria-hidden="true" className={styles.filters} focusable="false">
        <filter
          id="splash-background-sharpen"
          x="-5%"
          y="-5%"
          width="110%"
          height="110%"
          colorInterpolationFilters="sRGB"
        >
          <feConvolveMatrix
            order="3"
            kernelMatrix="0 -0.16 0 -0.16 1.64 -0.16 0 -0.16 0"
            preserveAlpha="true"
          />
        </filter>
      </svg>
      <Image
        alt=""
        aria-hidden="true"
        className={styles.background}
        fill
        onLoad={(event) => {
          void event.currentTarget.decode().catch(() => undefined).finally(() => setBackgroundReady(true));
        }}
        priority
        sizes="100vw"
        src="/home-hero-assets/elderly-woman.home-v2.poster.webp"
      />
      <div aria-hidden="true" className={styles.tone} />
      <div className={styles.content}>
        <h1 className={styles.brand}>忆见</h1>
        <p className={styles.tagline}>见一人 忆一生</p>
      </div>
    </section>
  );
}
