export type RiskType =
  | "sensitive_content"
  | "high_frequency"
  | "unauthorized_access"
  | "ai_response_risk"
  | "missing_consent"
  | "payment_risk"
  | "system_abuse";

export type RiskLevel = "low" | "medium" | "high" | "critical";

export interface RiskEvent {
  id: string;
  userId: string;
  memoryId: string | null;
  riskType: RiskType;
  level: RiskLevel;
  message: string;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export type CreateRiskEventInput = Omit<RiskEvent, "id" | "createdAt">;

export interface RiskDetectionInput {
  userId: string;
  memoryId?: string;
  userMessage?: string;
  assistantMessage?: string;
}

export interface RiskDetectionResult {
  detected: boolean;
  riskType?: RiskType;
  level?: RiskLevel;
  message?: string;
}
