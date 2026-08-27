import { QwenVoiceCloneBetaClient } from "@/src/components/voice-clone/QwenVoiceCloneBetaClient";

import styles from "./page.module.css";

export default async function VoiceCloneBetaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <div className={styles.root}>
      <QwenVoiceCloneBetaClient memoryId={id} />
    </div>
  );
}
