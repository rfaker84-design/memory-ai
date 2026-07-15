import { redirect } from "next/navigation";

export default async function LegacyMemoryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/memory/${encodeURIComponent(id)}`);
}
