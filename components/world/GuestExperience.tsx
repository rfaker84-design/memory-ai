"use client";

import { useState } from "react";

import { useReducedMotion } from "../../src/motion";
import { HomeCarousel, HOME_STORIES, type HomeStory } from "./HomeCarousel";
import { PublicProductNavigation } from "./PublicProductNavigation";
import styles from "./GuestExperience.module.css";

const DISCLOSURE = "AI生成示例 · 使用虚构示例资料 · 不代表真实人物或其真实表达";

type GuestExperienceProps = {
  onLogin: () => void;
  onStart: () => void;
  playbackActive?: boolean;
  showLogin?: boolean;
};

/** The approved public homepage shell. Carousel timing lives in HomeCarousel. */
export function GuestExperience({ onLogin, onStart, playbackActive = true, showLogin = true }: GuestExperienceProps) {
  const reducedMotion = useReducedMotion();
  const [activeStory, setActiveStory] = useState<HomeStory>(HOME_STORIES[0]);

  return (
    <main className={styles.experience} data-reduced-motion={reducedMotion ? "true" : "false"}>
      <HomeCarousel reducedMotion={reducedMotion} playbackActive={playbackActive} onActiveStoryChange={setActiveStory} />

      <header className={styles.heroHeader}>
        <span className={styles.heroWordmark}>忆见</span>
        {showLogin && <button className={styles.loginAction} type="button" onClick={onLogin}>登录</button>}
      </header>
      <section className={styles.heroInvitation} aria-label="开始创建">
        <button className={styles.heroPrimaryAction} type="button" onClick={onStart}>创建 TA</button>
      </section>
      <p className={styles.heroDisclosure} role="note">{DISCLOSURE}</p>
      <PublicProductNavigation active="home" overMedia />
      <p className={styles.srOnly} aria-live="polite">正在展示：{activeStory.label}</p>
    </main>
  );
}

