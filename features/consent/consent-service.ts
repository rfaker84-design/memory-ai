import type { ConsentRepository } from "./consent-repository";
import type {
  ConsentCheckInput,
  ConsentCheckResult,
  ConsentRecord,
  CreateConsentInput,
  UpdateConsentInput,
} from "./types";

export class ConsentService {
  constructor(private readonly repository: ConsentRepository) {}

  createConsent(input: CreateConsentInput): Promise<ConsentRecord> {
    return this.repository.create(input);
  }

  getConsent(id: string): Promise<ConsentRecord | null> {
    return this.repository.findById(id);
  }

  updateConsent(id: string, input: UpdateConsentInput): Promise<ConsentRecord> {
    return this.repository.update(id, input);
  }

  listMemoryConsents(memoryId: string): Promise<ConsentRecord[]> {
    return this.repository.listByMemory(memoryId);
  }

  listUserConsents(userId: string): Promise<ConsentRecord[]> {
    return this.repository.listByUser(userId);
  }

  async checkConsent(input: ConsentCheckInput): Promise<ConsentCheckResult> {
    const records = await this.repository.listByMemory(input.memoryId);
    const matchedRecord = records.find(
      (record) => record.consentType === input.consentType
    );

    if (!matchedRecord) {
      return {
        allowed: false,
        status: null,
        reason: "缺少授权记录",
      };
    }

    if (matchedRecord.status === "approved") {
      return {
        allowed: true,
        status: matchedRecord.status,
      };
    }

    return {
      allowed: false,
      status: matchedRecord.status,
      reason: "授权未通过",
    };
  }
}
