import { SessionGateUnavailable } from "../../src/components/auth/SessionGateUnavailable";

export default function ProductionProfilePage() {
  return <SessionGateUnavailable title="生产备用个人页" />;
}
