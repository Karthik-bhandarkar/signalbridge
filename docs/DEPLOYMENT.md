# SignalBridge Production Deployment & Operations Playbook

> **Target Environment:** Containerized Cloud Deployment (Kubernetes / AWS ECS / Linux VMs)  
> **Directive:** Do not deploy to paid cloud resources without explicit user approval. This document outlines production readiness, configuration, rollback procedures, and disaster recovery.

---

## 1. Production Topology Overview

```
                      [ Internet Clients / Webhooks ]
                                     │
                                     ▼
                      [ TLS / HTTPS Reverse Proxy ]
                      (AWS ALB / NGINX / Cloudflare)
                                     │
                 ┌───────────────────┴───────────────────┐
                 │                                       │
                 ▼                                       ▼
    [ Static Frontend Assets ]               [ Django API (Gunicorn) ]
    (S3 + CloudFront / NGINX)                - Ingestion Gateway
                                             - Operator REST APIs
                                             - Health Probes (/health/*)
                                                         │
                                ┌────────────────────────┼────────────────────────┐
                                │                        │                        │
                                ▼                        ▼                        ▼
                       [ PostgreSQL 16 ]          [ Redis 7 Cluster ]      [ AWS S3 Bucket ]
                       - Primary + Read Replica   - Task Broker DB 1       - Webhook Payload
                       - Connection Pooling       - Celery Backend DB 2      Cold Archives
                                                  - Idempotency Locks DB 0 - Daily DB Dumps
                                                         ▲
                                                         │
                                ┌────────────────────────┴────────────────────────┐
                                │                                                 │
                                ▼                                                 ▼
                    [ Celery Worker Pool ]                           [ Celery Beat Scheduler ]
                    - Webhook Normalization                          - Synthetic Monitor Pings
                    - S3 Cold Archival                               - Stale Work Recovery
                    - Outbound Notifications                         - Daily DB Backup Script
```

---

## 2. Production Environment Variables Reference

| Variable Name | Required | Default / Format | Description |
| :--- | :--- | :--- | :--- |
| `DJANGO_SETTINGS_MODULE` | Yes | `config.settings.production` | Activates production security headers and logging |
| `SECRET_KEY` | Yes | 50+ random characters | Cryptographic secret for session and CSRF signing |
| `DEBUG` | Yes | `False` | Must remain `False` in production |
| `ALLOWED_HOSTS` | Yes | `signalbridge.example.com` | Comma-separated list of permitted host headers |
| `CSRF_TRUSTED_ORIGINS` | Yes | `https://signalbridge.example.com` | Trusted origins for CSRF POST validation |
| `POSTGRES_DB` | Yes | `signalbridge_prod` | PostgreSQL database name |
| `POSTGRES_USER` | Yes | `signalbridge_app` | Least-privilege PostgreSQL user |
| `POSTGRES_PASSWORD` | Yes | *Stored in Secrets Manager* | Database user password |
| `POSTGRES_HOST` | Yes | `postgres.internal` | PostgreSQL host |
| `POSTGRES_PORT` | No | `5432` | PostgreSQL port |
| `REDIS_URL` | Yes | `rediss://...:6379/0` | TLS-encrypted Redis connection string |
| `CELERY_BROKER_URL` | Yes | `rediss://...:6379/1` | Redis connection for Celery task broker |
| `CELERY_RESULT_BACKEND` | Yes | `rediss://...:6379/2` | Redis connection for Celery task results |
| `AWS_STORAGE_BUCKET_NAME`| Yes | `signalbridge-payload-archive` | S3 bucket name for cold storage archives |
| `AWS_S3_REGION_NAME` | Yes | `us-east-1` | AWS S3 region |

---

## 3. Zero-Downtime Deployment Sequence

When deploying a new release, follow this strict pipeline order:

1. **Pre-Deployment Smoke Check:**
   - Execute test suite in CI (`pytest` + `npm run build`).
2. **Apply Database Migrations:**
   ```bash
   python manage.py migrate --no-input
   ```
   *Note: SignalBridge enforces backwards-compatible migrations. Never drop or rename columns in the same release as code changes.*
3. **Deploy Web Container Instances (Rolling Update):**
   - New containers spin up and pass `/health/live/` and `/health/ready/` checks before traffic is shifted by the load balancer.
4. **Deploy Celery Worker Instances:**
   - Send `SIGTERM` to existing workers to initiate graceful shutdown (allows running tasks to complete before exit).
5. **Update Celery Beat Scheduler:**
   - Single replica scheduler container updated to register new periodic task intervals.
6. **Deploy Frontend Static Assets:**
   - Upload compiled `frontend/dist/` bundle to S3/CDN.

---

## 4. Kubernetes / Orchestrator Probe Configuration

```yaml
livenessProbe:
  httpGet:
    path: /health/live/
    port: 8000
  initialDelaySeconds: 15
  periodSeconds: 10
  timeoutSeconds: 3
  failureThreshold: 3

readinessProbe:
  httpGet:
    path: /health/ready/
    port: 8000
  initialDelaySeconds: 10
  periodSeconds: 5
  timeoutSeconds: 3
  failureThreshold: 2
```

---

## 5. Database Backup and Disaster Recovery Procedure

### Automated Backup Script (`scripts/backup_db.sh`)
- Generates a timestamped `pg_dump` compressed archive: `signalbridge_backup_YYYYMMDD_HHMMSS.dump`.
- Uploads the dump to secure S3 bucket (`s3://${AWS_STORAGE_BUCKET_NAME}/backups/`).
- Automatically rotates local backups, pruning archives older than 14 days.

### Restoration Procedure (`scripts/restore_db.sh`)
```bash
# 1. Download backup archive from S3
aws s3 cp s3://signalbridge-backups/signalbridge_backup_20261020_120000.dump .

# 2. Run restoration script (includes confirmation prompt to prevent accidental execution)
./scripts/restore_db.sh signalbridge_backup_20261020_120000.dump
```

---

## 6. Rollback Playbook

If a critical failure occurs post-deployment:
1. **Rollback Container Image:** Revert container image tag to previous stable digest in Kubernetes deployment / ECS task definition.
2. **Database Reversion:** If migrations were applied that require rollback, use `python manage.py migrate <app_name> <previous_migration_name>`.
3. **Flush Ingestion Rate Limiters:** If needed, flush rate limit keys in Redis: `redis-cli -u $REDIS_URL --scan --pattern "ratelimit:*" | xargs redis-cli DEL`.
