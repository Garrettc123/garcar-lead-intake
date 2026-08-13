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

This baseline does **not** persist leads. Accepted leads are only acknowledged and logged to stdout in structured JSON format. See `/DEPLOYMENT.md` for persistence and production safety requirements.
