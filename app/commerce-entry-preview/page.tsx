import { notFound } from "next/navigation";

import { CommerceEntryPreviewShell } from "@/src/components/first-presence/CommerceEntryPreviewShell";

export default function CommerceEntryPreviewPage() {
  if (
    process.env.NODE_ENV === "production"
    || process.env.COMMERCE_ENTRY_PREVIEW_MODE !== "true"
  ) {
    notFound();
  }

  return (
    <main
      style={{
        minHeight: "100dvh",
        margin: "0 auto",
        padding: "max(1rem, env(safe-area-inset-top)) 1.15rem max(2rem, env(safe-area-inset-bottom))",
        background: "#100d0a",
      }}
    >
      <CommerceEntryPreviewShell />
    </main>
  );
}
