import type {
  ClaimMemoryChatTurnInput,
  CompleteMemoryChatTurnInput,
  MemoryChatTurnClaim,
  MemoryChatTurnResult,
} from "./memory-chat-turn-types";

export interface MemoryChatTurnDataSource {
  claim(input: ClaimMemoryChatTurnInput): Promise<MemoryChatTurnClaim>;
  complete(input: CompleteMemoryChatTurnInput): Promise<MemoryChatTurnResult>;
  fail(input: ClaimMemoryChatTurnInput): Promise<void>;
}
