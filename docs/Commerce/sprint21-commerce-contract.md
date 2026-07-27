# Sprint21 Commerce Credits and Referral Contract

Status: test-environment implementation; Migration 014 validated only in an
isolated PostgreSQL gate; production migration and payment remain disabled.

## Product catalog

| Product | Price | Permanent paid generation credits | First-preview save right |
|---|---:|---:|---|
| `memory_video_49` | ¥49 | 2 | Yes |
| `memory_video_99` | ¥99 | 6 | Yes |
| `memory_video_199` | ¥199 | 15 | Yes |

The catalog is server-owned. Clients submit only `productId` and `platform`;
they cannot submit a price, credit quantity, save permission, or payment rail.

Paid credit lots have no expiry. Free preview, photo remedy, and referral
experience lots are permanently marked `save_allowed = false`.

## Generation ledger

The video pipeline must call `CommerceService.reserveGeneration` before
submitting provider work and persist the same `requestKey` across retries.
It must then call `settleGeneration` with one of these terminal outcomes:

- `succeeded`: moves one credit from reserved to consumed.
- `system_failed`: releases the reservation to the same lot.
- `invalidated`: releases the reservation to the same lot.

Calling reserve again with the same request and payload returns the same
reservation. `recoverGeneration` is the network-recovery read path. A
contradictory payload or terminal outcome is rejected.

Purpose selects the only eligible credit source:

| Purpose | Source | Save allowed |
|---|---|---|
| `first_preview` | first TA's one free preview | No |
| `new_video` | paid package | Yes |
| `photo_remedy` | one replacement-photo remedy | No |
| `referral_experience` | referral reward | No |

The remedy can be created only after a successful free preview and is unique
per account and TA. A system failure or invalid result releases it; a
successful result consumes it.

## TA limit and first preview

Memory creation is serialized per account in PostgreSQL. An idempotent replay
still returns the original TA, but a genuinely new fourth TA returns:

```json
{ "error": "MEMORY_LIMIT_REACHED", "maxMemories": 3 }
```

The free preview lot is created only when reserving for the account's earliest
TA (`created_at`, then `id`). Later TAs cannot receive another free preview.

## Orders and payment adapters

- Web and Android use only the non-production `test` adapter in this Sprint.
  It is disabled unless `NODE_ENV !== production` and
  `COMMERCE_TEST_MODE=true`.
- The test adapter never charges money. Settlement requires an HMAC-signed
  request to `/api/commerce/testing/callbacks`.
- iOS always selects `storekit_iap`. The server returns a StoreKit action and
  `appAccountToken`; it does not provide H5 checkout or test settlement.
- StoreKit signed-transaction verification is intentionally not implemented
  until the native IAP and App Store server adapter receive separate approval.
- No production merchant credentials or payment calls are introduced.

Orders are unique by account and idempotency key. Provider events are unique by
payment rail and provider event ID, with a payload hash conflict check.
Successful settlement grants exactly one paid credit lot per order.

Refund applications are one per order and return the existing request on
retry. Refund provider calls remain manual-review only. A verified refund
callback revokes the remaining credit lot and transfers the first-preview save
right to another paid order, or removes it when none remains.

## Referral qualification

The invitee must:

1. have a session backed by a verified `phone:<sha256>` identity;
2. qualify within one hour of new-account creation;
3. present a token accepted by a trusted device-attestation adapter;
4. use a phone and attested device not used by any prior qualification;
5. differ from the inviter.

The default attestation adapter fails closed. Browser storage and React state
are never accepted as device proof or ledger state.

Every third qualified invitee creates one referral reward cohort and one
non-saveable experience credit. Database uniqueness on invitee, phone, device,
and `(inviter, cohort)` prevents duplicate rewards.

## Reconciliation

`GET /api/internal/commerce-reconciliation` is read-only and requires a
48-byte-or-longer `COMMERCE_RECONCILIATION_ACCESS_TOKEN`. It reports:

- paid orders missing a credit lot;
- product snapshot and lot quantity mismatches;
- paid users missing the first-preview save right;
- refunded orders that still own an active lot or save right;
- unsettled orders exposing active paid credit.

The endpoint never repairs data automatically.

## Migration approval gate

`database/migrations/014_commerce_credits_referrals.sql` is required before the
new APIs can use PostgreSQL. It is intentionally absent from
`scripts/postgresql/apply-migrations.sh`. The isolated gate does not authorize
adding it to that runner or applying it to production.

The gate creates disposable databases only when all three controls are set:

- the admin URL host is loopback;
- the database name starts with `commerce_gate_`;
- `COMMERCE_POSTGRES_GATE_ALLOW_DROP=YES`.

It verifies:

- ten new `commerce_*` tables;
- their foreign keys, unique idempotency constraints, checks, and indexes;
- composite ownership foreign keys across user, TA, order, reservation, and
  credit-lot boundaries;
- updated-at triggers;
- the read-only `014` postflight;
- 001-014 from empty, 014 replay, injected-failure rollback, and concurrent
  ledger behavior.

### Ten-table necessity audit

| Table | Verdict | Why it remains separate |
|---|---|---|
| `commerce_orders` | Required | Financial state and immutable product snapshot. |
| `commerce_order_events` | Required | Immutable provider-event deduplication and audit. |
| `commerce_refund_requests` | Required | User request and manual-review lifecycle differ from provider events. |
| `commerce_credit_lots` | Required | Permanent, source-typed account credit ledger. |
| `commerce_generation_reservations` | Required | Two-phase reserve/consume/release and network recovery. |
| `commerce_save_rights` | Required | Explicit, revocable first-preview entitlement and refund transfer. |
| `commerce_photo_remedies` | Required | One-use TA-scoped grant evidence and replacement-photo digest. |
| `commerce_referral_codes` | Required | Stable inviter/code ownership and retry identity. |
| `commerce_referral_qualifications` | Required | Phone/device anti-fraud uniqueness and qualification audit. |
| `commerce_referral_rewards` | Merge candidate | Its row overlaps the referral credit lot, but currently supplies a typed `(inviter, cohort)` uniqueness boundary and a countable audit record. |

`commerce_referral_rewards` is the first simplification target if table count
must be reduced before production. It can be merged only after
`commerce_credit_lots` gains typed inviter/cohort columns; folding it into the
current free-form `source_key` would weaken constraints and reconciliation.
The other apparent merge candidates (`save_rights` and `photo_remedies`) would
likewise replace typed ownership/evidence with derivation or JSON metadata, so
the gate does not recommend removing them.
