import { redirect } from "next/navigation";

/** Public sharing is not part of the approved first-release scope. */
export default function LegacySharePage() {
  redirect("/");
}
