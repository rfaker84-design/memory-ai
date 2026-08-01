import { assertProductionRuntimeContract } from "./production-runtime-contract.cjs";

export class ProductionAuthConfigurationError extends Error {
  constructor(public readonly code: string) {
    super(code);
    this.name = "ProductionAuthConfigurationError";
  }
}

/**
 * Prevent a production process from becoming healthy while authentication is
 * unusable. SMS is intentionally capability-scoped so an unavailable SMS
 * provider does not prevent unrelated production routes from starting.
 */
export function assertProductionAuthConfiguration(
  environment: NodeJS.ProcessEnv = process.env
): void {
  try {
    assertProductionRuntimeContract(environment);
  } catch (error) {
    const code = error instanceof Error && "code" in error && typeof error.code === "string"
      ? error.code
      : "PRODUCTION_RUNTIME_CONTRACT_INVALID";
    throw new ProductionAuthConfigurationError(code);
  }
}
