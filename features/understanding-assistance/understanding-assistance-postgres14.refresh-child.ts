import { PostgresUnderstandingAssistanceService } from "./understanding-assistance-postgres";
import { closePostgresPool } from "@/src/server/database";

const userId = process.env.UNDERSTANDING_ASSISTANCE_GATE_USER_ID;
const externalUserId = process.env.UNDERSTANDING_ASSISTANCE_GATE_EXTERNAL_USER_ID;

async function main(): Promise<void> {
  if (!userId || !externalUserId) {
    throw new Error("UNDERSTANDING_ASSISTANCE_GATE_IDENTITY_REQUIRED");
  }
  try {
    const state = await new PostgresUnderstandingAssistanceService().read({ userId, externalUserId });
    process.stdout.write(`${JSON.stringify(state)}\n`);
  } finally {
    await closePostgresPool();
  }
}

void main();
