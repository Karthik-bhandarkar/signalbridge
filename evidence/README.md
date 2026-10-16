# 📁 SignalBridge Verification Evidence Repository

> **Root Path:** `evidence/`  
> **Target Audience:** Technical Recruiters, Lead Backend Engineers, System Architects  
> **Verification Level:** Cryptographically and visually audited against local Docker, PostgreSQL 16, Redis 7, and Celery runtimes.  

---

## 🗂️ Directory Contents

```
evidence/
├── pgadmin-payloads-export.csv      # Raw database export of processed payloads with S3 archive keys
├── README.md                        # High-level evidence overview
└── screenshots/                     # Individual verified screenshots & SHA-256 audit index
    ├── README.md                    # Detailed image-by-image verification audit & checksums
    ├── 02-api-health.png            # HTTP 200 Root Health endpoint check
    ├── 03-webhook-accepted.png      # HTTP 202 Accepted valid webhook ingestion
    ├── 04-hmac-rejected.png         # HTTP 401 Unauthorized HMAC signature mismatch
    ├── 05-idempotency.png           # HTTP 200 OK duplicate replay suppression
    ├── 06-rate-limit.png            # HTTP 429 Too Many Requests sliding window limit
    ├── 07-postgres-processed.png    # pgAdmin 4 query: status PROCESSED + S3 cold archive key
    ├── 08-celery-worker.png         # Docker Desktop Celery worker execution log (0.086s)
    ├── 09-query-plan.png            # pgAdmin 4 EXPLAIN ANALYZE showing B-Tree Index Scan (0.078ms)
    ├── postman-missing-signature.png        # Negative security: 401 Missing HMAC header
    ├── postman-malformed-body.png           # Negative validation: 400 Malformed JSON envelope
    ├── postman-deactivated-source-403.png   # Negative security: 403 Deactivated source killswitch
    ├── postman-unknown-source-404.png       # Negative routing: 404 Unregistered vendor slug
    ├── postman-rate-limit-burst-1.png       # Sliding window burst request 1 (202 Accepted)
    ├── postman-rate-limit-burst-2.png       # Sliding window burst request 2 (202 Accepted)
    ├── postman-collection-structure.png     # Postman collection suite structure
    └── unverified-01-docker-services-postman-preflight.png # Audited preflight screenshot
```

---

## 🔍 Key Performance Metrics Proven by Evidence

1. **Sub-100ms Webhook ACK:**
   - Ingest latency: **30 ms** (`03-webhook-accepted.png`)
   - Health latency: **18 ms** (`02-api-health.png`)
   - Burst 2 latency: **11 ms** (`postman-rate-limit-burst-2.png`)
2. **Asynchronous Background Processing SLA:**
   - Celery worker correlation and S3 upload completed in **0.0865s** (`08-celery-worker.png`).
3. **Database Index Efficiency:**
   - PostgreSQL composite B-Tree backward scan completed in **0.078 ms** execution time (`09-query-plan.png`).
4. **Security & Cryptography:**
   - Invalid HMAC rejected in **12 ms** (`04-hmac-rejected.png`).
   - Missing HMAC signature rejected in **20 ms** (`postman-missing-signature.png`).
   - Deactivated killswitch enforced in **5 ms** (`postman-deactivated-source-403.png`).

---

For the full image-by-image breakdown, refer to [`evidence/screenshots/README.md`](file:///c:/MindForge/Project/01_SignalBridge_Webhook_Ingestion/evidence/screenshots/README.md).
