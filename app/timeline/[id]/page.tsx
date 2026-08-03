import { redirect } from "next/navigation";

/**
 * The former timeline performed a browser-side Supabase read and presented
 * unconfirmed historical material.  First release keeps that material behind
 * the owner-bound, explicitly confirmed pickup flow instead.
 */
export default async function LegacyTimelinePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/memory/${encodeURIComponent(id)}/pickup`);
}
