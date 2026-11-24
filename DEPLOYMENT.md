# Deployment Guide (Railway + Kubernetes)

This repository is prepared for a **controlled first production candidate**. It is not fully production-ready until manual actions below are completed.

## 1) Required secrets and environment

Use `.env.example` as the starting point.

Required secrets:
- `ADMIN_API_TOKEN` (long random token for admin endpoint auth)

Do **not** commit real secrets. Use Railway variables or Kubernetes Secrets.

## 2) Startup, migrations, and data persistence

Current service behavior:
- `LEAD_JOURNAL_PATH` is required outside tests and must name an absolute file path on a private persistent volume.
- Validated lead data is appended to a local NDJSON file with restrictive permissions and fsync before HTTP 202.
- Without a writable journal, /readyz and lead intake fail closed with HTTP 503; metrics never claim successful intake.
- This does **not** provide a multi-host transaction log, per-lead idempotency, database migrations, encryption, lifecycle retention, or verified backup/restore.

Implication:
- Ephemeral containers **must not** be used for this journal. Do not scale this service beyond one writer with this storage backend.
- Before enabling production traffic, verify a persistent encrypted volume, restricted access, backup and restore drills, and applicable privacy retention policy.
- Migrate to a managed durable database or queue (with idempotency and transactional acknowledgements) before multi-replica scaling.

## 3) Railway deployment (controlled)

1. Create Railway project from this repository.
2. Railway will detect `railway.toml` and build via `Dockerfile`.
3. Configure variables from `.env.example` in Railway (set real secret values only in Railway UI).
4. Configure custom domain and enforce TLS at Railway edge.
5. Point intake/webhook source to `https://<domain>/api/leads` only after manual verification.
6. Validate `/healthz` and `/readyz` from Railway deployment.

## 4) Kubernetes deployment (controlled)

Apply manifests in order:

```bash
kubectl apply -f k8s/configmap.yaml
kubectl apply -f k8s/secret.example.yaml # copy/edit into real secret manifest first
kubectl apply -f k8s/deployment.yaml
kubectl apply -f k8s/service.yaml
```

Kubernetes controls included:
- Rolling update strategy (`maxUnavailable: 0`, `maxSurge: 1`)
- Non-root runtime, seccomp default, dropped Linux capabilities
- Read-only root filesystem, no privilege escalation
- Resource requests/limits
- Liveness/readiness probes
- Graceful shutdown support (`terminationGracePeriodSeconds`, preStop hook)

Ingress/TLS:
- Add an Ingress/Gateway resource with HTTPS/TLS certificates (cert-manager or cloud-managed).
- Restrict public routing to required endpoints only.

## 5) Webhook and intake safety

- Require explicit user consent (`consentGiven: true`) for all accepted leads.
- Keep intake schema validation enabled.
- Use rate limiting defaults, tune by traffic profile.
- Never auto-contact customers from this service without human review and opt-in policies.

## 6) Authentication/authorization

- Admin endpoint (`/api/admin/stats`) requires a valid authorization token header.
- Rotate admin tokens regularly and scope access to least privilege.

## 7) Observability and backups

Observability now:
- Structured JSON logs to stdout
- Health/readiness endpoints

Still required before full production:
- Centralized log retention/search
- Alerting on 5xx/429 spikes and readiness failures
- Durable backups for any future data store (DB snapshots + restore drills)

## 8) Rollback plan

Railway:
- Redeploy prior successful image/release.

Kubernetes:
- `kubectl rollout undo deployment/garcar-lead-intake`

Always verify `/readyz` and smoke-test intake after rollback.

## 9) Cost controls and approval gates

- No deployment automation from pull-request code directly to production.
- `.github/workflows/production-approval-gate.yml` is manual (`workflow_dispatch`) and does not deploy.
- Keep staging and production separated.
- Set platform budget alerts and autoscaling caps before enabling public traffic.

## 10) Remaining manual actions before claiming production readiness

1. Implement durable lead storage + schema migrations.
2. Add identity/RBAC for admin operations beyond static token.
3. Configure DDoS/WAF and ingress rate controls at edge.
4. Add full SLO monitoring, on-call alerting, and backup restore runbooks.
5. Complete legal/privacy review for consent language and retention policy.
