"use client";

import styles from "./create-memory.module.css";

export type SoulStage = 0 | 10 | 30 | 50 | 80 | 100;

export type SoulBodyProps = {
  progress: SoulStage;
};

export function SoulBody({ progress }: SoulBodyProps) {
  const stageClass = `stage-${progress}`;

  return (
    <div className={`${styles.soulBody} ${styles[stageClass]}`} aria-hidden="true">
      <div className={styles.particles}>
        {Array.from({ length: 16 }).map((_, index) => (
          <span key={index} style={{ "--i": index } as React.CSSProperties} />
        ))}
      </div>

      <div className={styles.lightColumn} />
      <div className={styles.groundGlow} />
      <div className={styles.memoryThreads}>
        {Array.from({ length: 7 }).map((_, index) => (
          <i key={index} style={{ "--t": index } as React.CSSProperties} />
        ))}
      </div>

      <div className={styles.figureWrap}>
        <div className={styles.headGlow} />
        <div className={styles.faceGlow} />
        <div className={styles.shoulderGlow} />
        <div className={styles.bodyGlow} />
      </div>

      <div className={styles.seedLight} />
      <div className={styles.auraOne} />
      <div className={styles.auraTwo} />
    </div>
  );
}
