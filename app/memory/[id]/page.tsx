import { redirect } from "next/navigation";

/**
 * The historical memory-room visualized a TA with global emotion polling and
 * autonomous fragment playback. It is not a first-release surface. Keep old
 * deep links useful, but send them into the owned, continuously disclosed
 * companion chat instead of maintaining a parallel persona experience.
 */
export default async function LegacyMemoryRoomRedirect({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/memory-chat/${encodeURIComponent(id)}`);
}
