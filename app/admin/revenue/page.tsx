import { SessionGateUnavailable } from "@/src/components/auth/SessionGateUnavailable";

export default function AdminRevenuePage() {
  return <SessionGateUnavailable title="收入管理" />;
}
