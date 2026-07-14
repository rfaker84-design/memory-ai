# MemoryAI Production COS CAM Subaccount Setup

## Scope

This procedure creates the runtime identity for the production COS media and PostgreSQL backup integrations. It is intentionally limited to the policy in `tencent-cos-production-cam-policy.json`.

| Item | Value |
| --- | --- |
| Policy name | `MemoryAIProductionCosRuntimeLeastPrivilege` |
| Subaccount name | `memoryai-cos-runtime-prod` |
| Access method | Programmatic access only; console sign-in disabled |
| Media bucket | `memoryai-media-prod-1442603693` in `ap-guangzhou` |
| Backup bucket | `memoryai-pg-backup-prod-1442603693` in `ap-guangzhou` |

## Create and authorize the subaccount

1. In the Tencent Cloud console, open **CAM** > **Users** > **Create User**.
2. Create the user named `memoryai-cos-runtime-prod` with **Access Key / programmatic access** selected and **Console login** disabled.
3. Do not add the user to an administrative group and do not attach preset policies such as `AdministratorAccess` or `QcloudCOSFullAccess`.
4. Open **CAM** > **Policies** > **Create Custom Policy** > **Create by policy syntax**.
5. Name the policy `MemoryAIProductionCosRuntimeLeastPrivilege` and paste the complete JSON from `tencent-cos-production-cam-policy.json` without modification.
6. Attach only `MemoryAIProductionCosRuntimeLeastPrivilege` to `memoryai-cos-runtime-prod`.
7. Review the user’s effective policies. It must not inherit CAM, user-management, billing, console-administration, or any other bucket permissions.

## Key handling boundary

This task does not create an access key. In the separately approved production-injection step, create one programmatic access key for this subaccount, place it only in the server’s protected environment file, set that file to mode `600`, and restart the application under the approved deployment procedure. Never commit, print, or copy the SecretId or SecretKey into tickets, shell history, application logs, or this repository.

## Required validation after key injection

1. Verify media upload, metadata read, signed download, and deletion only below `media/`.
2. Verify backup upload, download, metadata read, and deletion only below `memoryai-postgresql/daily/` and `memoryai-postgresql/weekly/`.
3. Verify access to a different prefix in either bucket is denied.
4. Verify all operations against any other bucket are denied.
5. Verify CAM, billing, user-management, and console-management API calls are denied.

## List operation boundary

Tencent COS maps an object-list request to `name/cos:GetBucket`. The policy grants it only for `memoryai-pg-backup-prod-1442603693`, never for the media bucket, and uses the documented `cos:prefix` condition. It allows only the URL-encoded request prefixes `memoryai-postgresql%2Fdaily%2F` and `memoryai-postgresql%2Fweekly%2F`; a list request without one of those exact prefixes is denied. The backup job must send one of those two prefixes exactly.

## Multipart upload note

The backup object statement additionally permits the four actions required for controlled multipart uploads below `memoryai-postgresql/daily/*` and `memoryai-postgresql/weekly/*` only:

- `name/cos:InitiateMultipartUpload`
- `name/cos:UploadPart`
- `name/cos:CompleteMultipartUpload`
- `name/cos:AbortMultipartUpload`
- `name/cos:ListParts`

coscmd checks for an unfinished upload before it creates a new one. Its request supplies the complete object key as the multipart-list `Prefix`; the policy therefore grants `name/cos:ListMultipartUploads` only on the backup bucket and only with `string_like` conditions for `memoryai-postgresql/daily/*` or `memoryai-postgresql/weekly/*`. It grants `name/cos:ListParts` only for objects in those same two prefixes, so resumable uploads cannot inspect parts elsewhere.

It does not grant `UploadPartCopy` or `cos:*`. The media-bucket statement has no multipart or multipart-list actions.
