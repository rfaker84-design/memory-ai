import { redirect } from "next/navigation";

/**
 * Automatic long-term-memory is held from the first release. Historical beta
 * deep links lead to the user-initiated confirmation flow, where only explicit
 * owner-confirmed source material may become available to a TA.
 */
export default async function LegacyLongTermMemoryRedirect({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/memory/${encodeURIComponent(id)}/pickup`);
}
