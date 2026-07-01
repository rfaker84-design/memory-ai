import { supabase } from "../../src/lib/supabase";
import type { ConsentDataSource } from "./datasource";
import type {
  ConsentRecord,
  CreateConsentInput,
  UpdateConsentInput,
} from "./types";

type ConsentRow = {
  id: string;
  user_id: string;
  memory_id: string;
  consent_type: string;
  status: string;
  owner_name: string | null;
  relationship_to_owner: string | null;
  proof_url: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

const CONSENT_SELECT =
  "id,user_id,memory_id,consent_type,status,owner_name,relationship_to_owner,proof_url,notes,created_at,updated_at";

const toEntity = (row: ConsentRow): ConsentRecord => ({
  id: row.id,
  userId: row.user_id,
  memoryId: row.memory_id,
  consentType: row.consent_type as ConsentRecord["consentType"],
  status: row.status as ConsentRecord["status"],
  ownerName: row.owner_name,
  relationshipToOwner: row.relationship_to_owner,
  proofUrl: row.proof_url,
  notes: row.notes,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

export class ConsentSupabaseDataSource implements ConsentDataSource {
  async create(input: CreateConsentInput): Promise<ConsentRecord> {
    const { data, error } = await supabase
      .from("consent_records")
      .insert({
        user_id: input.userId,
        memory_id: input.memoryId,
        consent_type: input.consentType,
        status: input.status,
        owner_name: input.ownerName,
        relationship_to_owner: input.relationshipToOwner,
        proof_url: input.proofUrl,
        notes: input.notes,
      })
      .select(CONSENT_SELECT)
      .single();

    if (error) throw error;

    return toEntity(data as unknown as ConsentRow);
  }

  async findById(id: string): Promise<ConsentRecord | null> {
    const { data, error } = await supabase
      .from("consent_records")
      .select(CONSENT_SELECT)
      .eq("id", id)
      .maybeSingle();

    if (error) throw error;

    return data ? toEntity(data as unknown as ConsentRow) : null;
  }

  async update(
    id: string,
    input: UpdateConsentInput
  ): Promise<ConsentRecord> {
    const row: Record<string, unknown> = {};
    if (input.status !== undefined) row.status = input.status;
    if (input.proofUrl !== undefined) row.proof_url = input.proofUrl;
    if (input.notes !== undefined) row.notes = input.notes;

    const { data, error } = await supabase
      .from("consent_records")
      .update(row)
      .eq("id", id)
      .select(CONSENT_SELECT)
      .single();

    if (error) throw error;

    return toEntity(data as unknown as ConsentRow);
  }

  async listByMemory(memoryId: string): Promise<ConsentRecord[]> {
    const { data, error } = await supabase
      .from("consent_records")
      .select(CONSENT_SELECT)
      .eq("memory_id", memoryId)
      .order("created_at", { ascending: false });

    if (error) throw error;

    return (data as unknown as ConsentRow[]).map(toEntity);
  }

  async listByUser(userId: string): Promise<ConsentRecord[]> {
    const { data, error } = await supabase
      .from("consent_records")
      .select(CONSENT_SELECT)
      .eq("user_id", userId)
      .order("created_at", { ascending: false });

    if (error) throw error;

    return (data as unknown as ConsentRow[]).map(toEntity);
  }
}
