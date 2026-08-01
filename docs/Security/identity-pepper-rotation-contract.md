# Identity pepper rotation contract

This contract rotates the HMAC pepper used for phone, verification-code, and
trusted-request-IP digests without writing a secret to source control, chat,
command history, or an application build artifact.

## Runtime contract

The process accepts one current pepper and, only during a bounded overlap, one
previous pepper. `AUTH_VERIFICATION_PEPPER_KID` identifies the current value.
The previous value requires all of the following together:

- `AUTH_VERIFICATION_PEPPER_PREVIOUS`
- `AUTH_VERIFICATION_PEPPER_PREVIOUS_KID`
- `AUTH_VERIFICATION_PEPPER_PREVIOUS_VALID_UNTIL`

Both identifiers are restricted to a short non-secret token. The previous
value must be distinct, at least 32 bytes, and valid for at least the seven-day
session TTL plus clock tolerance and at most 180 days. A partial, expired,
duplicate, weak, or oversized overlap makes production startup fail before a
listener binds.

New challenges are always stored with the current digest. During the overlap,
rate limits, challenge verification, and user lookup accept both digest
candidates. Candidate locks are deduplicated and acquired in sorted order.
The code evaluates every digest candidate before deciding whether a challenge
matches.

## Ownership continuity

Users are keyed by immutable `users.id`. A successful login that finds the
previous phone identity updates `users.external_id` to the current digest in
the same transaction. While the previous pepper is configured, a valid JWT is
resolved by its immutable subject to the current external identity; therefore
an older unexpired cookie remains owner-bound after a reauthentication updates
that user record. If that lookup cannot resolve exactly one user, the session
is rejected.

The overlap minimum covers every pre-rotation session. It is a pre-launch
release requirement that no un-migrated legacy phone identity is allowed to
fall outside the approved overlap: once the previous pepper is retired, the
old HMAC cannot be derived from the new value. Production activation or
retirement therefore requires an audited migration/reauthentication result and
explicit Owner approval; it must not use a new-account login as evidence that
a legacy identity was migrated.

## Controlled procedure

1. Generate and store the next pepper only through the approved secret store
   or restricted server environment; never copy it into this repository.
2. Select distinct non-secret key identifiers and a bounded expiry that covers
   the session TTL. Validate the candidate runtime contract before release.
3. Release the dual-validation candidate to the approved non-production
   environment. Verify current-first challenge creation, previous challenge
   verification, rate-limit continuity, session owner continuity, and startup
   rejection for invalid overlap configuration.
4. Record only key identifiers, release SHA, effective window, aggregate
   migration/reauthentication counts, and test results. Do not record phone
   values, digest values, cookies, or pepper material.
5. Keep the previous value only for the approved window. Before removal, prove
   that the active session window elapsed and that every legacy identity has
   been migrated or entered an explicitly approved recovery path.
6. Retire the previous value, then verify that it is rejected. A rollback is
   permitted only while the bounded previous value remains approved and must
   be recorded as a security event.

Production rotation, secret-store changes, and retirement remain Owner-approved
operations. This contract does not authorize production deployment or secret
disclosure.
