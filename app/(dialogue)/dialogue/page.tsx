import { redirect } from "next/navigation";

export default async function DialoguePage({
  searchParams,
}: {
  searchParams: Promise<{ id?: string; entityId?: string }>;
}) {
  const query = await searchParams;
  const memoryId = query.id ?? query.entityId;
  redirect(memoryId ? `/memory-chat/${encodeURIComponent(memoryId)}` : "/memory-world");
}
