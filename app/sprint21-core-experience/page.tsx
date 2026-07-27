"use client";

import { useRouter } from "next/navigation";

import { MemorialPreviewExperience } from "../../src/components/memorial-preview/MemorialPreviewExperience";
import { MotionProvider } from "../../src/motion";

export default function Sprint21CoreExperiencePage() {
  const router = useRouter();

  return (
    <MotionProvider>
      <MemorialPreviewExperience
        acceptanceMode
        onClose={() => router.replace("/")}
      />
    </MotionProvider>
  );
}
