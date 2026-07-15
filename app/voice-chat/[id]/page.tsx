import { redirect } from "next/navigation";

export default async function LegacyVoiceChatPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/memory-chat/${encodeURIComponent(id)}`);
}
