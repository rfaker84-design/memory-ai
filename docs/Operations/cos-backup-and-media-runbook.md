# COS Backup and Media Operations

## PostgreSQL backup

`scripts/backup/postgresql-to-cos.sh` is the only formal PostgreSQL-to-COS backup entrypoint. Run it daily as root. It creates a custom-format dump, validates it with `pg_restore --list`, uploads it to the private backup bucket, downloads a verification copy, and compares SHA-256 before local retention runs. `scripts/postgresql/cos-upload.sh` only delegates to this entrypoint.

Install `coscmd` and place the dedicated backup credential configuration at `/etc/memoryai/coscmd-backup.conf`. It must be a regular, non-symlink file owned by `root:root`, mode `400` or `600`, and unreadable by ordinary users. The script always passes that exact path together with `/var/log/memoryai/coscmd-backup.log`, `COS_BACKUP_BUCKET`, and `COS_BACKUP_REGION` to every coscmd operation. It sets `HOME=/nonexistent` and removes generic Tencent credential variables before invoking child processes; `~/.cos.conf` and application credentials are never fallback sources.

Local retention is the latest 7 daily and 4 Sunday weekly backups. Remote retention is exclusively enforced by preconfigured COS lifecycle rules: objects under `memoryai-postgresql/daily/` expire after 8 days and objects under `memoryai-postgresql/weekly/` expire after 35 days. The script never lists or deletes remote objects.

Any failed backup stage stops the run and records only the stage name and exit code in the protected event log and syslog. An optional external alert hook may be installed at `/usr/local/sbin/memoryai-backup-alert`; when present it must be a regular `root:root` executable with mode `500` or `700`. Arbitrary command strings are never evaluated. The local dump is preserved after upload or verification failure.

Install `scripts/backup/memoryai-postgresql-cos-backup.cron` under `/etc/cron.d/` only after replacing its bucket placeholder. The template fixes `PATH` and `HOME=/nonexistent`, invokes only the canonical entrypoint, and deliberately omits a second `flock` because the script owns `/run/lock/memoryai-postgresql-cos-backup.lock`.

Before scheduling, verify in the COS console that the dedicated bucket has both lifecycle rules and that the backup identity is scoped only to the required prefixes. Installing the template or changing COS lifecycle policy is an explicit operator action, not part of repository validation.

## Alerts to monitor

- `$MEMORYAI_PG_BACKUP_ROOT/logs/backup-cos.log` lines containing `ALERT`
- `/var/log/memoryai/coscmd-backup.log` for coscmd operational diagnostics (mode `600`)
- syslog tag `memoryai-backup`
- media cleanup stderr lines containing `[media-cleanup] ALERT`

## Restore check

Download the selected COS object to a protected local directory, verify its recorded SHA-256, inspect it with `pg_restore --list`, and restore only into an isolated drill database first. Never overwrite production as part of an automated test.

No online COS upload or production migration is asserted until an operator supplies server-side credentials and records console/runtime evidence.
