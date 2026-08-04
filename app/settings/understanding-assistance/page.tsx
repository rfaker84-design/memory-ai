import Link from "next/link";

import { UnderstandingAssistancePanel } from "@/src/components/trust/UnderstandingAssistancePanel";

export default function UnderstandingAssistancePage() {
  return <>
    <p style={{ padding: "16px 24px 0", margin: 0 }}><Link href="/continuity">返回我的</Link></p>
    <UnderstandingAssistancePanel />
  </>;
}

