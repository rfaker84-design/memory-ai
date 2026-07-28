import { useState } from "react";
import { Share } from "@capacitor/share";
import { requestAccountDeletion } from "../contracts/account-deletion";
import { registerPushToken } from "../contracts/push-registration";
import { debugVideoUrl } from "../config/environment";
import { MemoryMedia, saveSignedVideo } from "../native/memory-media";

export function NativeCapabilityLab() {
  const [result, setResult] = useState("准备就绪");
  const run = async (action: () => Promise<string>) => {
    try { setResult(await action()); } catch { setResult("本次操作未完成"); }
  };
  return <main style={{ display: "grid", minHeight: "100dvh", alignContent: "center", gap: 12, padding: 24, background: "#111" }}>
    <p>设备能力检查（仅调试构建）</p>
    <button onClick={() => void run(async () => `${(await MemoryMedia.pickMedia({ limit: 20 })).items.length} 项素材已选择`)}>选择素材</button>
    <button onClick={() => void run(async () => {
      const url = debugVideoUrl();
      if (!url) throw new Error("missing");
      await saveSignedVideo({ signedUrl: url, fileName: "memoryai-debug.mp4", mimeType: "video/mp4" });
      return "视频已保存";
    })}>保存视频</button>
    <button onClick={() => void run(async () => { await Share.share({ text: "MemoryAI debug" }); return "已打开分享"; })}>分享</button>
    <button onClick={() => void run(async () => requestAccountDeletion().then(() => "").catch(() => "账号删除已安全拦截"))}>删除边界</button>
    <button onClick={() => void run(async () => registerPushToken().then(() => "").catch(() => "推送登记已安全拦截"))}>推送边界</button>
    <p>{result}</p>
  </main>;
}
