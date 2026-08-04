import { withPostgresTransaction } from "@/src/server/database";

import {
  FirstPresencePlaybackAuthorizationService,
  FirstPresencePlaybackError,
  type PlaybackAuthorizationDto,
} from "./first-presence-video-playback";

export type InitialEncounterPlaybackClaim =
  | { status: "claimed"; playback: PlaybackAuthorizationDto }
  | { status: "already_viewed" };

/** Atomically consumes an approved, non-saveable first preview for its Owner. */
export class InitialEncounterPlaybackClaimService {
  constructor(private readonly playback: Pick<FirstPresencePlaybackAuthorizationService, "authorize">) {}

  async claim(input: { externalUserId: string; memoryId: string; jobId: string }): Promise<InitialEncounterPlaybackClaim> {
    // Do not consume a one-time encounter when the approved artifact cannot be
    // read and signed. The returned URL is still Owner-bound and inline-only.
    const playback = await this.playback.authorize(input);
    if (playback.saveAllowed) throw new FirstPresencePlaybackError("PLAYBACK_NOT_AVAILABLE");
    return withPostgresTransaction(async (client) => {
      const inserted = await client.query(
        `INSERT INTO public.initial_encounter_playback_claims (job_id, user_id, memory_id)
         SELECT job.id, job.user_id, job.memory_id
           FROM public.video_generation_jobs job
           JOIN public.users account ON account.id=job.user_id
           JOIN public.commerce_generation_reservations reservation ON reservation.id=job.reservation_id AND reservation.user_id=job.user_id
          WHERE job.id=$1::uuid AND job.memory_id=$2::uuid AND account.external_id=$3
            AND reservation.purpose='first_preview'
            AND job.status='succeeded' AND job.quality_status='approved'
         ON CONFLICT (job_id) DO NOTHING
         RETURNING job_id`,
        [input.jobId, input.memoryId, input.externalUserId],
      );
      if (inserted.rowCount === 1) return { status: "claimed", playback };
      const eligible = await client.query(
        `SELECT 1 FROM public.video_generation_jobs job
           JOIN public.users account ON account.id=job.user_id
           JOIN public.commerce_generation_reservations reservation ON reservation.id=job.reservation_id AND reservation.user_id=job.user_id
          WHERE job.id=$1::uuid AND job.memory_id=$2::uuid AND account.external_id=$3
            AND reservation.purpose='first_preview'
            AND job.status='succeeded' AND job.quality_status='approved'`,
        [input.jobId, input.memoryId, input.externalUserId],
      );
      if (eligible.rowCount !== 1) throw new FirstPresencePlaybackError("PLAYBACK_NOT_AVAILABLE");
      return { status: "already_viewed" };
    });
  }
}
