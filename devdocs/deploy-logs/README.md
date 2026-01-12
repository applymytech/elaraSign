# Deploy Logs

Automated logs from `deploy-checklist.ps1`.

Each deployment creates a log with:
- Timestamp
- Version change (if any)
- Documentation status (current/stale/intentional)
- Completeness (complete/framework/WIP)
- Change summary

## Purpose

- **Accountability** - Who deployed what, when
- **Honesty** - Was this intentional or rushed?
- **AI tracking** - What did the copilot actually do?
- **Audit trail** - If something breaks, what changed?

## Log Files

Log files are named: `deploy-YYYY-MM-DD_HH-mm-ss.log`

These are gitignored (local only) but you can choose to commit important ones.
