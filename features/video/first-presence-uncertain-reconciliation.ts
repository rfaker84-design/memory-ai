import type { FirstPresenceVideoJob } from "./first-presence-video-service";

export type FirstPresenceUncertainReconciliationRepository = {
  reconcileUncertainSubmission(input: {
    id: string;
    requestKey: string;
    operatorAccount: string;
    action: "ATTACH_PROVIDER_TASK" | "RELEASE_UNRESOLVED";
    providerTaskId?: string;
    reason: string;
  }): Promise<FirstPresenceVideoJob>;
};

/** Internal-only capability. It is intentionally separate from worker recovery and review. */
export class FirstPresenceUncertainReconciliationService {
  constructor(
    private readonly repository: FirstPresenceUncertainReconciliationRepository,
  ) {}

  reconcile(input: {
    jobId: string;
    idempotencyKey: string;
    operatorAccount: string;
    action: "ATTACH_PROVIDER_TASK" | "RELEASE_UNRESOLVED";
    providerTaskId?: string;
    reason: string;
  }): Promise<FirstPresenceVideoJob> {
    return this.repository.reconcileUncertainSubmission({
      id: input.jobId,
      requestKey: input.idempotencyKey,
      operatorAccount: input.operatorAccount,
      action: input.action,
      providerTaskId: input.providerTaskId,
      reason: input.reason,
    });
  }
}
