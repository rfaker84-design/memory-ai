# GitHub Push Protection Remediation — 2026-07-11

## Finding

| Field | Result |
|---|---|
| Secret type | Tencent Cloud Secret ID pattern |
| Affected file | `.env.example` |
| Historical locations | Initial GitHub finding: `f16bb4a`, `934c4d5`, `2c7a984`, `8ba5a6f`; local scan found the same placeholder across 17 reachable pre-rewrite commits. |
| Lines | 32 in older commits; 43 in the prior Sprint15A commit. |
| Masked fingerprint | `AKID…xxxx`; SHA-256: `093efd7cb95638da7c6351b04e1c23938d1cff57ab6e5b0773c502aca21c46b6` |
| Real credential | No. The matched text was the exact repeated placeholder pattern, and it did not match the current server Tencent Cloud access-key identifier. |
| Tencent Cloud rotation | Not required for this placeholder. No SecretKey was read or recorded. |

## Remediation

- Replaced the current `.env.example` Tencent placeholders with `replace-with-secret-id` and `replace-with-secret-key`.
- Added the explicit Tencent Cloud console naming aliases with the same non-secret values.
- Rewrote only the local, unpushed refs below, replacing the identified Tencent Secret ID pattern in `.env.example` while preserving the remaining business content, authors, timestamps, and commit messages.
- Did not rewrite `main`, did not force-push, and did not use the GitHub allow/unblock flow.

## Offline backup

- Bundle: `C:\Users\Administrator\MemoryAi-history-backup-20260711.bundle`
- `git bundle verify`: PASS.
- The bundle contains the pre-rewrite `canonical-mainline`, `sprint15a-final`, and `archive/server-visual-drift-20260711` refs.

## Ref mapping

| Ref | Before | After |
|---|---|---|
| `canonical-mainline` | `8bbbd2820735028beb92fa8b5983bc51f2cd94e6` | `a2b7972a193bf8ceb66a79b6d7f61da4b72258cc` |
| `sprint15a-tencentdb` | `8ba5a6f26d7bb03adc592788097a0fd899378e22` | `4600fab3f60e1e763ab6a194a4da772550220915` |
| `archive/server-visual-drift-20260711` | `5ae22e7c951eca3cb4e1eb0a6635e7936c54d9c1` | `07342361468c84c33b84bc72ce11488c8abae1f9` |
| `sprint15a-final` | `8ba5a6f26d7bb03adc592788097a0fd899378e22` | `4600fab3f60e1e763ab6a194a4da772550220915` |
| `sprint14-ui-final` | `e33bbb42bc857238426e1876a71342c03d5de2e2` | `f0d0016819df00b0652a953b6150ad8294cf25fd` |

## Post-rewrite verification

- Current `.env.example`: no Tencent Secret ID pattern match.
- Rewritten target refs: no Tencent Secret ID pattern match.
- Original Sprint14/Sprint15/archive commits: not reachable from rewritten target refs.
- `git fsck`, diff, typecheck, build, architecture, health, and push verification results are recorded in the closure output for this task.

## Push result

- `sprint15a-tencentdb`: pushed normally.
- `canonical-mainline`: pushed normally.
- `archive/server-visual-drift-20260711`: pushed normally.
- `sprint14-ui-final`: pushed normally.
- `sprint15a-final`: pushed normally.
- GitHub Push Protection accepted all five target refs after remediation. No allow-list or bypass action was used.
