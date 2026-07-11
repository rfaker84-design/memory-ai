# COS Backup and Media Operations

## PostgreSQL backup

Run `scripts/backup/postgresql-to-cos.sh` daily as root. It creates a custom-format dump, validates it with `pg_restore --list`, uploads it to the private backup bucket, downloads a verification copy, and compares SHA-256 before retention runs.

Install `coscmd` and configure its credential file for the dedicated backup bucket under the root account with mode `600`. The script also requires the server-only credential variables to be present as a fail-closed configuration check; it never prints their values.

Retention is the latest 7 daily and 4 Sunday weekly backups, both locally and in COS. If upload, download verification, or hash comparison fails, the local dump is preserved and an `ALERT` entry is written to `backup-cos.log` and syslog. Missing credentials exit with code 2 and are not a successful upload.

Suggested cron:

```bash
15 2 * * * /home/ubuntu/memory-ai/scripts/backup/postgresql-to-cos.sh
```

## Alerts to monitor

- `$MEMORYAI_PG_BACKUP_ROOT/logs/backup-cos.log` lines containing `ALERT`
- syslog tag `memoryai-backup`
- media cleanup stderr lines containing `[media-cleanup] ALERT`

## Restore check

Download the selected COS object to a protected local directory, verify its recorded SHA-256, inspect it with `pg_restore --list`, and restore only into an isolated drill database first. Never overwrite production as part of an automated test.

No online COS upload or production migration is asserted until an operator supplies server-side credentials and records console/runtime evidence.
