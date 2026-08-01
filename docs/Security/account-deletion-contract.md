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

- `ACCOUNT_DELETION_CONTENT_RETENTION_DAYS`,
  `ACCOUNT_DELETION_PROVIDER_RETENTION_DAYS`, and
  `ACCOUNT_DELETION_BACKUP_RETENTION_DAYS` may shorten the default deadlines
  but may never exceed 7, 30, and 90 days respectively, and must remain in
  chronological order;

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

Operational logs and deletion audit receipts are also separate from content:
they retain only the minimum request, status, timestamp and redacted failure or
receipt facts needed for security, support and legal accountability. They must
never contain chat bodies, photographs, voice bytes, object keys, provider URLs
or customer-visible deletion-receipt secrets. The final retention periods for
financial, complaint and accounting records remain a China mainland
lawyer-and-accountant launch gate.

Legal holds are scoped exceptions, never a blanket bypass: the request must
name the reason, covered scope, approving operator and expiry. When a hold
expires it is reviewed and the normal worker queue resumes.

## Worker operation

`npm run worker:account-deletion` is intentionally disabled unless
`ACCOUNT_DELETION_WORKER_ENABLED=true` is set in the target runtime after the
candidate migration is approved. It claims one task with `FOR UPDATE SKIP
LOCKED`; a worker that dies while a task is `running` is reclaimed only after a
ten-minute lease expires. Remote locators are copied to
the private deletion ledger before online rows are removed. The customer
receipt endpoint returns only status and completion facts, never object keys,
provider identifiers, chat text or media.

Dependent accounts whose protected profile requires a guardian cannot create a
request until the named guardian has completed a freshly authenticated,
server-bound confirmation. That confirmation is separately auditable and
expires after fifteen minutes; a dependent account cannot self-assert it.

The final production retention periods for finance, disputes and accounting
records remain subject to China mainland lawyer and accountant review. That is
a launch gate, not permission to use retained records for product features,
training or generation.

Vidu completed-artifact deletion is a separate vendor action: until Vidu
provides a documented deletion route or human-process receipt, the worker must
keep the provider task pending or blocked and must not report the account
deletion as complete.

## Customer data export

`POST /api/account/export` is separately fail-closed behind
`ACCOUNT_DATA_EXPORT_ENABLED=true` and
`AUTH_SESSION_REVOCATION_ENFORCED=true`. It requires the current Owner Session,
an allowed browser Origin, and a reauthentication no older than five minutes.
The response is an attachment with private no-store headers. It includes owned
TA content, conversations, messages, media metadata, consent records, video
job state, and a minimum customer-facing order/refund summary. It never exports
session material, device data, authentication challenges, provider payloads or
identifiers, object keys, signed URLs, payment-rail identifiers, or internal
audit metadata. Media download endpoints remain independently Owner-bound.
