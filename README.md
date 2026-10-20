# SignalBridge — Webhook Ingestion Engine

[![Python 3.11+](https://img.shields.io/badge/python-3.11%20%7C%203.13-blue.svg)](https://python.org)
[![Django 5](https://img.shields.io/badge/django-5.1-092E20.svg)](https://djangoproject.com)
[![PostgreSQL 16](https://img.shields.io/badge/database-PostgreSQL%2016-336791.svg)](https://postgresql.org)
[![Redis 7](https://img.shields.io/badge/broker%20%26%20cache-Redis%207-DC382D.svg)](https://redis.io)
[![Celery 5.4](https://img.shields.io/badge/tasks-Celery%205.4-37814A.svg)](https://docs.celeryq.dev)
[![Docker](https://img.shields.io/badge/containers-Docker%20Compose-2496ED.svg)](https://docker.com)
[![Newman Tests](https://img.shields.io/badge/newman-28%2F28%20passed-brightgreen.svg)](postman/README.md)
[![License: MIT](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)

SignalBridge is a backend system that receives webhooks from external services, checks their security signatures, confirms receipt in under 30 milliseconds, and processes the alert payloads in the background using worker queues.

---

## 1. Project Summary

A webhook is an automated HTTP message sent from one computer system to another when an event happens (for example, when a server monitoring tool detects high CPU usage and sends an alert payload).

SignalBridge acts as an ingestion gateway for these incoming messages. When an external service (such as PagerDuty, Datadog, or GitHub) sends a webhook, SignalBridge immediately validates the sender's identity, guards against duplicates, records the raw message, and returns an HTTP 202 Accepted status code so the sender does not time out. Heavy work—such as grouping alerts into incident tickets and archiving raw message bodies to cloud storage—is handed off to background worker processes.

### What I Built:
* An HTTP gateway built with Django and Django REST Framework that validates and acknowledges webhooks in an average of 13 ms (under 30 ms measured peak on local Docker).
* A cryptographic verification check using HMAC-SHA256 and constant-time string comparison to reject fake or modified requests.
* A duplicate-message filter using Redis that recognizes repeated webhook deliveries within a 60-second window and returns HTTP 200 without reprocessing.
* A rolling rate limiter that tracks request timestamps to prevent any single sender from sending more requests than its allowed limit per minute.
* A background processing pipeline using Celery and Redis that parses alerts, groups matching alerts under a single incident using database row locks, and uploads raw message copies to date-partitioned S3 storage.

---

## 2. The Problems This Project Solves

When an online service receives automated webhooks from third-party platforms, four concrete engineering problems occur:

1. **Senders Give Up If the Server Is Slow (Timeouts):**
   External webhook senders expect an HTTP response within 2 to 5 seconds. If the receiving server attempts to parse data, query databases, and notify staff inside the HTTP request thread, the response takes too long. The sender cuts the connection and marks the delivery as failed.
2. **Senders Resend the Same Message (Duplicate Processing):**
   Networks occasionally drop connection packets. When a sender delivers a message successfully but does not receive the confirmation in time, it automatically resends the exact same message. Without duplicate detection, the receiver charges a customer twice or creates two separate incidents for the same outage.
3. **Anyone Can Send Fake Messages (Security Vulnerabilities):**
   Webhook receiver URLs are public web addresses on the internet. Any script or attacker can send fake HTTP POST requests. If the receiver does not verify a cryptographic signature attached to the message, it will accept fraudulent data.
4. **Traffic Spikes Overload the Database (Connection Pool Exhaustion):**
   During a cloud outage, monitoring tools can fire hundreds of alert webhooks per second. If every incoming request opens a separate connection to write directly to PostgreSQL, the database exceeds its maximum connection limit and crashes the web server.

---

## 3. How It Works

SignalBridge divides the work into two clear phases: immediate gateway checks (synchronous) and background processing (asynchronous).

### Step-by-Step Execution:
1. **Receive:** The sender sends an HTTP `POST` request to `/api/v1/webhooks/<source_slug>/` containing a JSON body and an `X-Signature-256` header.
2. **Check Sender Allowed:** The gateway checks if the source slug exists in PostgreSQL and verifies that `is_active` is true. If deactivated, it immediately returns `HTTP 403 Forbidden`.
3. **Check Signature:** The gateway reads the raw body bytes, calculates the expected HMAC-SHA256 signature using the shared secret key, and compares it to the incoming header using constant-time comparison. If invalid, it returns `HTTP 401 Unauthorized`.
4. **Check Rate Limit:** The gateway checks how many requests this sender made in the last 60 seconds against its per-minute limit. If exceeded, it returns `HTTP 429 Too Many Requests`.
5. **Check for Duplicates:** The gateway hashes the raw message body into a SHA-256 fingerprint and checks Redis. If the fingerprint exists, the gateway returns `HTTP 200 OK` (`duplicate_ignored`) without saving or reprocessing.
6. **Save and Queue:** If fresh, the gateway records the incoming message in PostgreSQL with status `PENDING` and pushes a background task to the Redis queue.
7. **Reply 202 Accepted:** The gateway returns `HTTP 202 Accepted` to the sender with a tracking ID in under 30 milliseconds.
8. **Background Processing:** A Celery worker process pulls the task from the Redis queue.
9. **Group Alerts into Incidents:** The worker normalizes the alert data, acquires an advisory lock on the alert fingerprint, updates or creates the parent incident with a row-level lock (`SELECT FOR UPDATE`), increments the alert count, and escalates severity if needed.
10. **Archive to Storage:** The worker uploads the raw JSON payload to date-partitioned S3 object storage (or local S3Mock) and marks the database record as `PROCESSED`.

### Architecture Flow Diagram:

```text
[ External Sender: PagerDuty / Datadog / GitHub ]
                       │
                       │ 1. HTTP POST with HMAC Signature
                       ▼
┌─────────────────────────────────────────────────────────────┐
│             GATEWAY TIER (Django REST Framework)            │
│                                                             │
│  • Check if source is active (return 403 if deactivated)    │
│  • Verify HMAC-SHA256 signature (return 401 if invalid)     │
│  • Check sliding-window rate limit (return 429 if exceeded) │
│  • Check Redis duplicate key (return 200 if duplicate)      │
│  • Save IngestedPayload row with status 'PENDING'           │
│  • Push process_webhook task to Redis queue                 │
│                                                             │
│  ⚡ Returns HTTP 202 Accepted (< 30 ms)                     │
└─────────────────────────────────────────────────────────────┘
                       │
                       │ Task enqueued in Redis broker
                       ▼
┌─────────────────────────────────────────────────────────────┐
│             BACKGROUND WORKER TIER (Celery)                 │
│                                                             │
│  • Pop task from Redis queue                                │
│  • Calculate alert deduplication fingerprint                │
│  • Acquire pg_advisory_xact_lock to prevent creation races  │
│  • Acquire SELECT FOR UPDATE on Incident row                │
│  • Increment alert_count and update incident severity       │
│  • Upload raw JSON payload to S3 storage                    │
│  • Update IngestedPayload row to status 'PROCESSED'         │
└─────────────────────────────────────────────────────────────┘
```

---

## 4. Key Features

| Feature | What It Does | Why It Matters | Implementation File |
| :--- | :--- | :--- | :--- |
| **Fast Webhook Acknowledgment** | Accepts requests and returns `HTTP 202 Accepted` in under 30 ms. | Prevents third-party senders from timing out and retrying. | [`apps/webhooks/views.py`](apps/webhooks/views.py) |
| **HMAC-SHA256 Signature Check** | Recalculates a cryptographic signature from raw request bytes and compares it using `hmac.compare_digest()`. | Blocks unauthorized senders and prevents side-channel timing attacks. | [`apps/webhooks/security.py`](apps/webhooks/security.py) |
| **Duplicate Message Suppression** | Stores a SHA-256 fingerprint in Redis for 60 seconds using atomic `SET NX`. | Stops repeated network retries from creating duplicate actions or database entries. | [`apps/core/dsa/idempotency.py`](apps/core/dsa/idempotency.py) |
| **Sliding-Window Rate Limiter** | Tracks incoming request timestamps over a 60-second rolling window. | Prevents burst traffic from overloading application workers. | [`apps/core/dsa/sliding_window.py`](apps/core/dsa/sliding_window.py) |
| **Concurrency Incident Locking** | Uses PostgreSQL transaction advisory locks and row-level locks (`SELECT FOR UPDATE`). | Guarantees that 20 alerts arriving at the same millisecond attach to 1 single incident instead of creating 20 duplicate tickets. | [`apps/alerts/services.py`](apps/alerts/services.py) |
| **Tiered Cold Storage Archiving** | Offloads raw JSON bodies to S3-compatible storage with date keys (`archives/slug/YYYY/MM/DD/id.json`). | Prevents the PostgreSQL database from growing too large over time. | [`apps/webhooks/archival.py`](apps/webhooks/archival.py) |
| **Source Kill Switch** | Rejects requests for inactive sources in 5 ms with `HTTP 403 Forbidden`. | Allows operators to turn off a compromised or misbehaving sender immediately. | [`apps/webhooks/views.py`](apps/webhooks/views.py) |

---

## 5. Technology Used and Why

| Technology | What It Does Here | Why It Was Chosen |
| :--- | :--- | :--- |
| **Python 3.11+** | Primary programming language. | Includes standard cryptographic tools (`hmac`, `hashlib`) and backend ecosystem support. |
| **Django 5 & DRF** | Web framework and REST API routing. | Provides clean URL routing, request parsing, and reliable database ORM models. |
| **PostgreSQL 16** | Relational database (ACID compliant). | Stores sources, alert models, incident records, and supports row-level locks (`SELECT FOR UPDATE`) and advisory locks. |
| **Redis 7** | In-memory cache and task broker. | Delivers fast key lookups for duplicate checks and queues tasks for Celery workers. |
| **Celery 5.4+** | Background worker process runner. | Moves alert normalization, incident grouping, and file storage out of the HTTP request. |
| **AWS S3 (via Boto3)** | Cloud object storage for message archives. | Designed for storing large, unstructured files at low cost. Standard Boto3 client calls are production-ready. |
| **Adobe S3Mock** | Local S3 emulator running in Docker. | Allows complete testing of S3 file uploads and downloads on a local computer without needing an AWS account or internet connection. |
| **Docker & Compose** | Container management for all 5 services. | Runs PostgreSQL, Redis, S3Mock, Django web, and Celery worker in an isolated, reproducible environment. |
| **GitHub Actions** | Automated CI pipeline. | Runs automated tests on every code push to verify that tests pass before merging. |

> **Environment Note:** When running locally with Docker Compose, S3Mock simulates AWS S3 on port 9090. To use real AWS S3 in a cloud deployment, update the `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, and `AWS_STORAGE_BUCKET_NAME` variables in `.env`.

---

## 6. Results and Proof

All performance numbers below were **measured on a local Docker setup**:

| What Was Measured | Result | How It Was Measured | Visual Evidence |
| :--- | :--- | :--- | :--- |
| **Webhook Acknowledgment Time** | **30 ms** peak *(Avg: 13 ms)* | Postman live request to `/api/v1/webhooks/pagerduty/` | [`evidence/screenshots/03-webhook-accepted.png`](evidence/screenshots/03-webhook-accepted.png) |
| **Duplicate Message Suppression** | **15 ms** (`HTTP 200 duplicate_ignored`) | Postman replaying identical payload within 60s | [`evidence/screenshots/05-idempotency.png`](evidence/screenshots/05-idempotency.png) |
| **Rate Limit Burst Enforcement** | **13 ms** (`HTTP 429 Too Many Requests`) | Postman firing requests exceeding allowed quota | [`evidence/screenshots/06-rate-limit.png`](evidence/screenshots/06-rate-limit.png) |
| **Invalid Signature Rejection** | **12 ms** (`HTTP 401 Unauthorized`) | Postman request with modified signature header | [`evidence/screenshots/04-hmac-rejected.png`](evidence/screenshots/04-hmac-rejected.png) |
| **Missing Signature Header** | **20 ms** (`HTTP 401 Unauthorized`) | Postman request with no signature header | [`evidence/screenshots/postman-missing-signature.png`](evidence/screenshots/postman-missing-signature.png) |
| **Deactivated Source Kill Switch** | **5 ms** (`HTTP 403 Forbidden`) | Postman request to inactive source endpoint | [`evidence/screenshots/postman-deactivated-source-403.png`](evidence/screenshots/postman-deactivated-source-403.png) |
| **Unregistered Source Slug** | **18 ms** (`HTTP 404 Not Found`) | Postman request to an unknown source slug | [`evidence/screenshots/postman-unknown-source-404.png`](evidence/screenshots/postman-unknown-source-404.png) |
| **Malformed JSON Envelope** | **18 ms** (`HTTP 400 Bad Request`) | Postman request missing the required payload body | [`evidence/screenshots/postman-malformed-body.png`](evidence/screenshots/postman-malformed-body.png) |
| **Background Processing Time** | **0.0865s (86 ms)** | Celery worker log output during correlation and S3 upload | [`evidence/screenshots/08-celery-worker.png`](evidence/screenshots/08-celery-worker.png) |
| **PostgreSQL Index Scan Query** | **0.078 ms** execution time | pgAdmin 4 running `EXPLAIN (ANALYZE, BUFFERS)` on B-Tree index | [`evidence/screenshots/09-query-plan.png`](evidence/screenshots/09-query-plan.png) |
| **Automated Postman Suite** | **14 / 14 requests passed (28 / 28 assertions, 1074 ms)** | Automated Newman CLI run against all collection folders | [`postman/README.md`](postman/README.md) |
| **Concurrency Incident Safety** | **20 threads $\rightarrow$ 1 Incident, 0 duplicates** | Automated Python thread-pool test with real database locks | [`tests/concurrency/test_incident_locking.py`](tests/concurrency/test_incident_locking.py) |

---

## 7. Project File Structure

```text
signalbridge/
├── .github/workflows/
│   └── ci.yml               # GitHub Actions continuous integration workflow
├── apps/
│   ├── alerts/              # Incident models, alert correlation, and row-level locks
│   ├── analytics/           # Metric tracking models
│   ├── core/                # Shared utilities: rate limiting, retry queue, idempotency
│   └── webhooks/            # Webhook ingestion view, HMAC verification, S3 archiver
├── config/
│   ├── settings/            # Configuration files (base.py, local.py, production.py, test.py)
│   ├── celery.py            # Celery worker application configuration
│   └── urls.py              # Main URL routing and OpenAPI documentation endpoints
├── evidence/
│   ├── screenshots/         # Visual proof screenshots and SHA-256 integrity audit
│   ├── pgadmin-payloads-export.csv  # Database export of processed payloads with S3 keys
│   └── README.md            # Evidence index and performance summary
├── postman/
│   ├── SignalBridge_Zero_Setup_Verification.postman_collection.json  # 1-click test collection
│   ├── SignalBridge_API_Verification.postman_collection.json         # Strict environment collection
│   ├── SignalBridge_Environment_Template.postman_environment.json   # Sanitized environment template
│   └── README.md            # Detailed Postman and Newman execution instructions
├── requirements/
│   ├── base.txt             # Core dependencies (Django, DRF, Celery, psycopg, boto3)
│   ├── local.txt            # Local testing dependencies (pytest, ruff, ipython)
│   └── production.txt       # Production web server dependencies (gunicorn)
├── tests/
│   ├── concurrency/         # Multi-threaded race condition tests (20 parallel workers)
│   ├── integration/         # Full end-to-end API, Celery task, and documentation route tests
│   └── unit/                # Unit tests for rate limiting, retry queue, and deduplication
├── .dockerignore            # Files excluded from Docker builds
├── .env.example             # Template file showing required environment variables
├── .gitignore               # Files excluded from git tracking
├── docker-compose.yml       # Configuration for all 5 containers
├── Dockerfile               # Instructions to build the Python application container
├── manage.py                # Django command-line management tool
├── pytest.ini               # Pytest settings and test discovery configuration
├── schema.yml               # Complete OpenAPI 3.0 API specification
└── README.md                # Main project documentation
```

### Explanation of Folders and Files:

| Folder / File | What It Does |
| :--- | :--- |
| [`apps/alerts/`](apps/alerts/) | Stores alert and incident models; handles grouping alerts under incidents using row-level locks. |
| [`apps/webhooks/`](apps/webhooks/) | Contains the main ingestion view, HMAC verification logic, Celery tasks, and S3 file archiver. |
| [`apps/core/`](apps/core/) | Contains shared modules: the in-memory sliding-window rate limiter, retry queue, and Redis idempotency manager. |
| [`config/`](config/) | Holds Django project configuration, modular settings (`base`, `local`, `production`, `test`), Celery setup, and URL routes. |
| [`tests/concurrency/`](tests/concurrency/) | Verifies that 20 simultaneous threads processing identical alerts create only 1 parent incident. |
| [`tests/integration/`](tests/integration/) | Verifies that webhooks complete the full cycle: ingestion, validation, Celery queuing, and storage. |
| [`tests/unit/`](tests/unit/) | Verifies individual components in isolation: signature checks, rate limiting windows, and retry scheduling. |
| [`postman/`](postman/) | Provides ready-to-import Postman collections with automated pre-request HMAC calculation scripts. |
| [`evidence/`](evidence/) | Stores screenshot evidence, database CSV exports, and cryptographic file checksums proving test results. |
| [`docker-compose.yml`](docker-compose.yml) | Defines and connects the 5 Docker containers (web, worker, PostgreSQL, Redis, S3Mock). |
| [`Dockerfile`](Dockerfile) | Builds the Debian-based Python 3.11 application image used by the web and worker containers. |
| [`schema.yml`](schema.yml) | Describes every endpoint, parameter, and HTTP response code using the OpenAPI 3.0 standard. |
| [`.github/workflows/ci.yml`](.github/workflows/ci.yml) | Automates running the test suite on GitHub whenever code is committed or merged. |

---

## 8. Challenges and Solutions

### 1. Duplicate Incidents When Multiple Alerts Arrive at Once
* **The Problem:** When an outage occurs, multiple worker processes receive alerts for the same issue at the same millisecond. If all processes check the database simultaneously, none find an existing incident, so every process creates a new one. This causes duplicate incident tickets for a single outage.
* **The Solution:** A two-phase locking sequence was implemented in [`apps/alerts/services.py`](apps/alerts/services.py). First, workers compute a numeric hash of the alert's fingerprint and acquire a PostgreSQL transaction advisory lock (`pg_advisory_xact_lock`). This forces workers with matching alert fingerprints to line up sequentially. Second, the worker updating the incident acquires a row lock (`SELECT FOR UPDATE`), incrementing the alert count and escalating severity safely.

### 2. Preventing Side-Channel Timing Attacks on Signatures
* **The Problem:** Standard string comparison (`==`) compares text one character at a time and stops at the first mismatch. An attacker can send thousands of requests with different characters and measure microscopic time differences to guess the secret signature.
* **The Solution:** In [`apps/webhooks/security.py`](apps/webhooks/security.py), signature validation uses Python's built-in `hmac.compare_digest()`. This function takes the exact same amount of time to compare strings regardless of how many characters match, removing timing clues.

### 3. Preventing Database Bloat from Raw Payloads
* **The Problem:** Incoming webhook payloads can be large JSON objects (up to 50 KB each). Storing thousands of raw payloads directly in PostgreSQL increases database disk usage and slows down index searches.
* **The Solution:** In [`apps/webhooks/archival.py`](apps/webhooks/archival.py), Celery workers stream the raw JSON body to S3 object storage (or local S3Mock) under a date-partitioned path (`archives/<slug>/<YYYY>/<MM>/<DD>/<id>.json`). PostgreSQL only stores a lightweight text pointer (`s3_payload_key`) to the file.

### 4. Preventing Traffic Spikes at Minute Boundaries
* **The Problem:** Simple rate limiters that reset every calendar minute allow a client to send its full allowance at second 59 and another full allowance at second 01 of the next minute, causing double the intended traffic.
* **The Solution:** In [`apps/core/dsa/sliding_window.py`](apps/core/dsa/sliding_window.py), a rolling sliding window tracks individual request timestamps. Timestamps older than 60 seconds are discarded continuously, ensuring the sender never exceeds its quota across any 60-second span.

---

## 9. How to Run and Verify

### Prerequisites:
* [Docker Desktop](https://www.docker.com/products/docker-desktop/) (version 20+ with Docker Compose)
* Git

### Step 1: Clone the Repository
```bash
git clone https://github.com/Karthik-bhandarkar/signalbridge.git
cd signalbridge
```

### Step 2: Set Up Environment Variables
Copy the pre-configured local development template:
```bash
cp .env.example .env
```

### Step 3: Start the Multi-Container Stack
Build and launch all 5 containers (PostgreSQL, Redis, S3Mock, Web, Celery Worker):
```bash
docker compose up -d --build
```
Check that all containers are running:
```bash
docker compose ps
```

### Step 4: Run the Automated Tests
Run the test suite inside the running web container:
```bash
docker compose exec web pytest
```

### Step 5: Test with Postman (Zero-Setup 1-Click Option)
1. Open Postman.
2. Click **Import** and select [`postman/SignalBridge_Zero_Setup_Verification.postman_collection.json`](postman/SignalBridge_Zero_Setup_Verification.postman_collection.json).
3. Open any request (for example, `01 - Valid Webhook (202 Accepted)`) and click **Send**.
4. The bundled pre-request script calculates the HMAC-SHA256 signature automatically. You do not need to configure an external environment file.

### Step 6: Test Headlessly with Newman (Optional)
If you have [Node.js](https://nodejs.org/) and Newman installed:
```bash
newman run postman/SignalBridge_API_Verification.postman_collection.json \
  -e postman/SignalBridge_Environment_Template.postman_environment.json
```

---

## 10. API Overview

Defined in [`schema.yml`](schema.yml) and available interactively in your browser at `http://127.0.0.1:8000/api/docs/`:

### Primary Ingestion Endpoint:
* **Method:** `POST`
* **Path:** `/api/v1/webhooks/<source_slug>/`
* **Headers:**
  * `Content-Type: application/json`
  * `X-Signature-256: sha256=<hex_digest>` (or `X-Signature-SHA256`)
  * `X-Tracking-Id: <optional_client_id>`
* **Request Body Example:**
  ```json
  {
    "event_type": "alert.trigger",
    "tracking_id": "trc-example-1001",
    "payload": {
      "service": "payment-api",
      "severity": "CRITICAL",
      "fingerprint": "database-timeout",
      "title": "Database connection pool exhausted",
      "description": "API latency exceeded 5000ms"
    }
  }
  ```

### HTTP Response Status Codes:

| Status Code | Reason | Meaning |
| :--- | :--- | :--- |
| `202 Accepted` | Webhook queued | Signature is valid, rate limit is clean, payload saved and task pushed to worker queue. |
| `200 OK` | `duplicate_ignored` | Identical payload received within the 60-second deduplication window; ignored without reprocessing. |
| `400 Bad Request` | Invalid envelope | Request body is empty or missing the required `"payload"` field. |
| `401 Unauthorized` | Invalid signature | Missing, tampered, or mismatched HMAC cryptographic signature header. |
| `403 Forbidden` | Source deactivated | Webhook source exists but its `is_active` flag is set to false (kill switch active). |
| `404 Not Found` | Unknown source | The `source_slug` provided in the URL does not exist in the database. |
| `429 Too Many Requests` | Rate limit exceeded | Sender exceeded its per-minute burst quota; includes a `Retry-After` header. |

---

## 11. Known Limitations and Future Improvements

* **In-Memory Rate Limiting Scope:**
  * *Current state:* The sliding-window rate limiter stores timestamps in the memory of the specific web container process. If you run multiple web container instances behind a load balancer, each instance tracks its own counter.
  * *Future improvement:* Move sliding-window timestamp tracking into a shared Redis sorted set so limits are enforced collectively across all application instances.
* **Idempotency Key Reservation Window:**
  * *Current state:* In [`apps/webhooks/views.py`](apps/webhooks/views.py), the duplicate-check key is reserved in Redis immediately before the initial database write and Celery task enqueue. If the server loses power or crashes during that brief gap, the message is not saved, but an immediate retry from the sender within 60 seconds would be treated as a duplicate.
  * *Future improvement:* Implement a transactional outbox pattern where the message and its task are committed in a single database transaction before confirming the Redis key.
* **Storage Provider Configuration:**
  * *Current state:* Local development relies on S3Mock. Running in production requires setting real AWS credentials in `.env` and ensuring the target S3 bucket exists.
  * *Future improvement:* Add automated Terraform or CloudFormation scripts to provision production S3 buckets, IAM roles, and Redis clusters.

---

## 12. Glossary

* **Webhook:** An automated HTTP POST request sent from an external service to notify another system about an event.
* **HMAC (Hash-based Message Authentication Code):** A digital signature created by combining the message text with a secret key using cryptographic hashing (SHA-256) to verify authenticity.
* **Constant-Time Comparison:** A string comparison method that always takes the same amount of time regardless of how many characters match, preventing attackers from timing responses to guess secrets.
* **Idempotency:** A property where processing the exact same message multiple times produces the exact same result as processing it once.
* **Queue:** A temporary holding list (managed here by Redis) that stores tasks waiting to be picked up by worker processes.
* **Worker:** A background program (managed here by Celery) that takes jobs from a queue and runs heavy processing outside the HTTP request.
* **Row-Level Lock (`SELECT FOR UPDATE`):** A database instruction that temporarily locks a specific record so only one worker can edit it at a time, preventing race conditions.
* **Advisory Lock (`pg_advisory_xact_lock`):** An application-defined lock in PostgreSQL used to serialize worker actions based on an arbitrary numeric ID.
* **S3 (Simple Storage Service):** A cloud object storage service designed to store files, logs, and raw data efficiently.

---

## 13. Author & License

* **Author:** Karthik Bhandarkar
* **Repository:** [https://github.com/Karthik-bhandarkar/signalbridge](https://github.com/Karthik-bhandarkar/signalbridge)
* **License:** Distributed under the **MIT License**.
