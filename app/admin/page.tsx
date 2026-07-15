import { SessionGateUnavailable } from "@/src/components/auth/SessionGateUnavailable";

export default function AdminPage() {
  return <SessionGateUnavailable title="管理功能" />;
}
