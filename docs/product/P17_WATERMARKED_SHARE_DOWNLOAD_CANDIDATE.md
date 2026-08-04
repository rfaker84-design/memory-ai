# P-17 watermarked share-download candidate

This addendum implements the existing launch-rule requirement that a public
share is view-only while an Owner can explicitly enable a watermarked download.
It does not replace `MEMORYAI_LAUNCH_PRODUCT_RULES_V1.md`.

The capability is available only for an active Owner link whose video is
manually approved, settled, non-`first_preview`, `save_allowed=true`, has an
artifact, and has no active visibility hold. Those conditions are repeated when
the Owner enables downloading, when the route resolves the video, and when the
minimal audit event is written.

The server renders `AI Generated | MemoryAI` into a temporary private
directory. The derivative is deleted in `finally` and never receives a COS or
other object-storage key. A rendering or audit failure returns no video. The
audit event retains only the share id, video-job id, output SHA-256, output byte
count, and `ephemeral` derivative classification; it excludes storage keys,
Provider URLs, paths, and user content.

Local code and tests are not device, Staging, Provider, or production proof.
Migration 021 remains outside the automatic runner and still requires separate
Staging approval.
