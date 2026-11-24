# garcar-lead-intake

Minimal contractor lead intake API baseline prepared for controlled Railway and Kubernetes deployments.

## Local development

```bash
npm ci
npm test
npm start
```

Default local port: `3000`

## API endpoints

- `GET /healthz` - liveness
- `GET /readyz` - readiness
- `POST /api/leads` - lead intake with consent + validation
- `GET /api/admin/stats` - admin metrics (token-based auth required)

## Notes

The intake now returns **202** only after appending the validated lead to a local, permission-restricted, `fsync`-confirmed NDJSON journal. Set `LEAD_JOURNAL_PATH` to an **absolute path on a persistent private volume**. Without it (or when unwritable), `/readyz` and intake fail closed with **503**. This is a single-host durability candidate, **not** a multi-replica production database. Secure access, encryption at rest, backup/restore and retention must be verified before accepting real customer records. No automatic outreach or payment occurs.
