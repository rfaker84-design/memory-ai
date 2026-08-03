import type { Metadata } from "next";

import ShareVideoClient from "./ShareVideoClient";

export const metadata: Metadata = {
  title: "纪念影像分享 | 忆见",
  robots: { index: false, follow: false, nocache: true },
};

export default async function VideoSharePage({ params }: { params: Promise<{ publicId: string }> }) {
  return <ShareVideoClient publicId={(await params).publicId} />;
}
