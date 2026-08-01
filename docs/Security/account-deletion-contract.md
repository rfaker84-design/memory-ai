# Account deletion contract

An account deletion request is not complete when the user row is deleted.
Completion requires: session revocation; a durable, idempotent request record;
owned memory, media, video artifact and provider-object cleanup; explicit
payment/refund/legal-retention exceptions; and a redacted audit result.

No deletion worker may delete an object outside the authenticated user's
recorded ownership scope. A retry must be safe, and a failed external object
delete must remain visible as pending rather than being reported as complete.

## Retention and isolation

The candidate policy is configurable, not hard-coded as a legal conclusion:

- revoke login sessions and device access immediately;
- remove online TA, chat, media, voice and generated-video rows no later than
  seven days after confirmation;
- remove COS objects, derivatives and Provider copies no later than thirty
  days, retaining only a redacted provider deletion receipt;
- let immutable backup media age out naturally within ninety days. A restore
  must reapply the account-deletion tombstone before restored data becomes
  usable by a product service;
- keep orders, refunds, invoices, complaints and regulatory holds in a
  separate minimum-necessary archive. They must not restore photos, chat text,
  voice or generated media to product access.

Legal holds are scoped exceptions, never a blanket bypass: the request must
name the reason, covered scope, approving operator and expiry. When a hold
expires it is reviewed and the normal worker queue resumes.

## Worker operation

`npm run worker:account-deletion` is intentionally disabled unless
`ACCOUNT_DELETION_WORKER_ENABLED=true` is set in the target runtime after the
candidate migration is approved. It claims one task with `FOR UPDATE SKIP
LOCKED`; crashes leave a durable `retry` record. Remote locators are copied to
the private deletion ledger before online rows are removed. The customer
receipt endpoint returns only status and completion facts, never object keys,
provider identifiers, chat text or media.

The final production retention periods for finance, disputes and accounting
records remain subject to China mainland lawyer and accountant review. That is
a launch gate, not permission to use retained records for product features,
training or generation.
