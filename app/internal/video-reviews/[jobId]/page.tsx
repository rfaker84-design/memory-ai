import { cookies } from "next/headers";
import { notFound } from "next/navigation";

import {
  FirstPresenceReviewerBrowserSessionSigner,
  FirstPresenceVideoReviewPreviewQuery,
  REVIEWER_BROWSER_SESSION_COOKIE,
  reviewerBrowserPreviewAvailable,
} from "@/features/video";
import { getVideoInternalAccessConfiguration } from "@/src/server/security/video-internal-access";

import { ReviewerVideoPreview } from "./ReviewerVideoPreview";
import styles from "./page.module.css";

type Props = { params: Promise<{ jobId: string }> };

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function VideoReviewPage({ params }: Props) {
  if (!reviewerBrowserPreviewAvailable()) notFound();
  const { jobId } = await params;
  try {
    const configuration = getVideoInternalAccessConfiguration();
    const signer = new FirstPresenceReviewerBrowserSessionSigner(configuration.reviewToken, configuration.previousReviewToken);
    const cookieStore = await cookies();
    if (!signer.verify({ token: cookieStore.get(REVIEWER_BROWSER_SESSION_COOKIE)?.value, scope: "session", jobId })) {
      notFound();
    }
    const artifact = await new FirstPresenceVideoReviewPreviewQuery().findPendingForReview({ jobId });
    if (!artifact) notFound();
  } catch {
    notFound();
  }

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <p className={styles.eyebrow}>内部视频审核</p>
        <h1>待审预览</h1>
        <p>仅供人工审核。此页不会改变审核状态。</p>
      </header>
      <ReviewerVideoPreview jobId={jobId} />
    </main>
  );
}
