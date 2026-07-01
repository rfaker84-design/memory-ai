import { RiskDetector } from "./risk-detector";
import type { RiskRepository } from "./risk-repository";
import type {
  CreateRiskEventInput,
  RiskDetectionInput,
  RiskDetectionResult,
  RiskEvent,
} from "./types";

export class RiskService {
  private detector = new RiskDetector();

  constructor(private readonly repository: RiskRepository) {}

  detect(input: RiskDetectionInput): RiskDetectionResult {
    return this.detector.detect(input);
  }

  log(input: CreateRiskEventInput): Promise<RiskEvent> {
    return this.repository.create(input);
  }

  listUserRisks(userId: string, limit?: number): Promise<RiskEvent[]> {
    return this.repository.listByUser(userId, limit);
  }

  listMemoryRisks(memoryId: string, limit?: number): Promise<RiskEvent[]> {
    return this.repository.listByMemory(memoryId, limit);
  }
}
