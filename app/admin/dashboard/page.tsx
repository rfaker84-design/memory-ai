import { SessionGateUnavailable } from "@/src/components/auth/SessionGateUnavailable";

export default function AdminDashboardPage() {
  return <SessionGateUnavailable title="管理仪表盘" />;
}
