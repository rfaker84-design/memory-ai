import { SessionGateUnavailable } from "../src/components/auth/SessionGateUnavailable";

export default function ProductionHomePage() {
  return <SessionGateUnavailable title="生产备用首页" />;
}
