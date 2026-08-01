# Account deletion contract

An account deletion request is not complete when the user row is deleted.
Completion requires: session revocation; a durable, idempotent request record;
owned memory, media, video artifact and provider-object cleanup; explicit
payment/refund/legal-retention exceptions; and a redacted audit result.

No deletion worker may delete an object outside the authenticated user's
recorded ownership scope. A retry must be safe, and a failed external object
delete must remain visible as pending rather than being reported as complete.
