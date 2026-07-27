# Legacy chat-commerce quarantine

Baseline: `a01ab6778090dee3b31e84b4cff34efa98c0fe89`.

The retired product is the 49 yuan, 30-day, one-TA, 100 AI-reply card. It is
not the current image-credit catalogue under `/api/commerce/*`.

## Public closure inventory

| Former surface | Quarantine result |
| --- | --- |
| First-presence second-preview purchase card | Removed; the preceding action exits the flow. |
| Memory conversation `MemoryExperienceOffer` | Import and render removed. |
| `/continuity` `RefundCenter` | Import and render removed. |
| `/terms` and `/report` old refund-policy copy | Old product policy bindings removed. |
| `/api/payments/orders`, `/refunds`, `/entitlements` | Public middleware returns `410 LEGACY_ROUTE_UNAVAILABLE`; handlers also require an exact test account and otherwise return 404. |
| `/api/payments/wechat/callback`, `/api/internal/refund-reviews` | Removed from the formal allowlist and route handlers return 410. |
| `memory-chat` legacy paid quota | Ordinary accounts use free quota; the old payment ledger is reached only for a permitted internal test account. |
| `src/components/payment/*`, `features/payment/*`, `src/lib/payment.ts` | Retained dormant historical implementation and tests; no public page imports the purchase or refund components. |

Historical components, payment clients, repositories, and migrations 010/012 are
retained for order audit only. They are not public entry points. Historic order
data is neither deleted nor rewritten.

## Internal test exception

All three conditions are required:

```dotenv
NODE_ENV=development # any value except production
LEGACY_CHAT_COMMERCE_TEST_MODE=true
LEGACY_CHAT_COMMERCE_TEST_ACCOUNTS=phone:internal-test-account
```

`LEGACY_CHAT_COMMERCE_TEST_ACCOUNTS` is an exact comma-separated allowlist. A
missing flag, malformed list, unmatched account, or `NODE_ENV=production`
closes the capability. No broad role, client flag, browser storage, or deep
link can enable it.

## Non-goals

- No production migration and no changes to historic payment rows.
- No changes to 49/99/199 image-credit products, StoreKit boundaries, or
  `/api/commerce/*` routes.
