import type { MemoryChatTurnRepository } from "./memory-chat-turn-repository";
import type {
  ClaimMemoryChatTurnInput,
  CompleteMemoryChatTurnInput,
  MemoryChatTurnClaim,
  MemoryChatTurnResult,
} from "./memory-chat-turn-types";

export class MemoryChatTurnService {
  constructor(private readonly repository: MemoryChatTurnRepository) {}

  claim(input: ClaimMemoryChatTurnInput): Promise<MemoryChatTurnClaim> {
    return this.repository.claim(input);
  }

  complete(input: CompleteMemoryChatTurnInput): Promise<MemoryChatTurnResult> {
    return this.repository.complete(input);
  }

  fail(input: ClaimMemoryChatTurnInput): Promise<void> {
    return this.repository.fail(input);
  }
}
