"use client";

import { useEffect } from "react";

import { BRAND_LAUNCH_DURATION_MS } from "./staticBrandLaunchPolicy";
import styles from "./StaticBrandLaunch.module.css";

type StaticBrandLaunchProps = {
  onComplete: () => void;
};

export default function StaticBrandLaunch({ onComplete }: StaticBrandLaunchProps) {
  useEffect(() => {
    const timer = window.setTimeout(onComplete, BRAND_LAUNCH_DURATION_MS);
    return () => window.clearTimeout(timer);
  }, [onComplete]);

  return (
    <section className={styles.launch} aria-label="忆见品牌介绍">
      <div className={styles.content}>
        <h1 className={styles.brand}>
          <span>忆见</span>
          <span className={styles.english}>MEMORYAI</span>
        </h1>
        <p className={styles.tagline}>把确认过的记忆，留在这里。</p>
        <p className={styles.capabilities}>AI 纪念陪伴 · 已确认资料</p>
      </div>
    </section>
  );
}
