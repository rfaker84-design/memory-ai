import type { PoolClient } from "pg";

import {
  queryPostgres,
  withPostgresTransaction,
} from "../../src/server/database";
import type { AuditDataSource } from "./datasource";
import type { AuditLog, CreateAuditLogInput } from "./types";

type AuditRow = {
  id: string;
  external_id: string;
  memory_id: string | null;
  action: AuditLog["action"];
  level: AuditLog["level"];
  message: string;
  metadata: Record<string, unknown> | null;
  created_at: string | Date;
};

function toAuditLog(row: AuditRow): AuditLog {
  return {
    id: row.id,
    userId: row.external_id,
    memoryId: row.memory_id,
    action: row.action,
    level: row.level,
    message: row.message,
    metadata: row.metadata ?? {},
    createdAt:
      row.created_at instanceof Date
        ? row.created_at.toISOString()
        : row.created_at,
  };
}

async function ensureUser(client: PoolClient, externalId: string): Promise<string> {
  const result = await client.query<{ id: string }>(
    `
      INSERT INTO users (external_id)
      VALUES ($1)
      ON CONFLICT (external_id)
      DO UPDATE SET updated_at = users.updated_at
      RETURNING id
    `,
    [externalId]
  );
  return result.rows[0].id;
}

function safeLimit(limit: number | undefined): number {
  if (!Number.isInteger(limit) || !limit) return 50;
  return Math.min(200, Math.max(1, limit));
}

export class AuditPostgresDataSource implements AuditDataSource {
  async create(input: CreateAuditLogInput): Promise<AuditLog> {
    const row = await withPostgresTransaction(async (client) => {
      const userId = await ensureUser(client, input.userId);
      const result = await client.query<AuditRow>(
        `
          WITH written AS (
            INSERT INTO audit_logs
              (user_id, memory_id, action, level, message, metadata)
            VALUES ($1, $2, $3, $4, $5, $6::jsonb)
            RETURNING *
          )
          SELECT
            written.id,
            users.external_id,
            written.memory_id,
            written.action,
            written.level,
            written.message,
            written.metadata,
            written.created_at
          FROM written
          JOIN users ON users.id = written.user_id
        `,
        [
          userId,
          input.memoryId,
          input.action,
          input.level,
          input.message,
          JSON.stringify(input.metadata ?? {}),
        ]
      );
      return result.rows[0];
    });

    return toAuditLog(row);
  }

  async listByUser(userId: string, limit?: number): Promise<AuditLog[]> {
    const result = await queryPostgres<AuditRow>(
      `
        SELECT
          logs.id,
          users.external_id,
          logs.memory_id,
          logs.action,
          logs.level,
          logs.message,
          logs.metadata,
          logs.created_at
        FROM audit_logs logs
        JOIN users ON users.id = logs.user_id
        WHERE users.external_id = $1
        ORDER BY logs.created_at DESC
        LIMIT $2
      `,
      [userId, safeLimit(limit)]
    );
    return result.rows.map(toAuditLog);
  }

  async listByMemory(memoryId: string, limit?: number): Promise<AuditLog[]> {
    const result = await queryPostgres<AuditRow>(
      `
        SELECT
          logs.id,
          users.external_id,
          logs.memory_id,
          logs.action,
          logs.level,
          logs.message,
          logs.metadata,
          logs.created_at
        FROM audit_logs logs
        JOIN users ON users.id = logs.user_id
        WHERE logs.memory_id = $1
        ORDER BY logs.created_at DESC
        LIMIT $2
      `,
      [memoryId, safeLimit(limit)]
    );
    return result.rows.map(toAuditLog);
  }
}
