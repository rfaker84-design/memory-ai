"use client";

import { SoulBody, type SoulStage } from "./SoulBody";
import styles from "./create-memory.module.css";

export const stageText: Record<SoulStage, string> = {
  0: "开始唤醒TA",
  10: "灵魂光点正在回应",
  30: "记忆正在归来",
  50: "声音唤醒了生命",
  80: "故事赋予了灵魂",
  100: "欢迎回来",
};

export function SoulAwakeningStage({ progress }: { progress: SoulStage }) {
  return (
    <section className={styles.stagePanel} aria-label="灵魂体唤醒进度">
      <div className={styles.stageSky}>
        <SoulBody progress={progress} />
      </div>
      <div className={styles.stageCaption}>
        <p>{stageText[progress]}</p>
        <span>把记忆放慢一点，光会替你守住它。</span>
      </div>
    </section>
  );
}
