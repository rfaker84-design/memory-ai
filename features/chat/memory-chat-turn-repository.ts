import type { MemoryChatTurnDataSource } from "./memory-chat-turn-datasource";
import type {
  ClaimMemoryChatTurnInput,
  CompleteMemoryChatTurnInput,
  MemoryChatTurnClaim,
  MemoryChatTurnResult,
} from "./memory-chat-turn-types";

export class MemoryChatTurnRepository {
  constructor(private readonly dataSource: MemoryChatTurnDataSource) {}

  claim(input: ClaimMemoryChatTurnInput): Promise<MemoryChatTurnClaim> {
    return this.dataSource.claim(input);
  }

  complete(input: CompleteMemoryChatTurnInput): Promise<MemoryChatTurnResult> {
    return this.dataSource.complete(input);
  }

  fail(input: ClaimMemoryChatTurnInput): Promise<void> {
    return this.dataSource.fail(input);
  }
}
