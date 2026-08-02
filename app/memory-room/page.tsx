import { redirect } from "next/navigation";

/** Historical room entry point. It intentionally has no client work. */
export default function LegacyMemoryRoomIndexRedirect() {
  redirect("/memory-world");
}
