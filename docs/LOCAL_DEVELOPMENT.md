# SignalBridge Local Development & Operator Guide

> This guide provides step-by-step instructions for running SignalBridge locally on developer workstations, executing unit and concurrency tests, and developing full-stack features.

---

## 1. Prerequisites

- **Python:** 3.11, 3.12, or 3.13
- **Node.js:** v20+ with npm v10+
- **Docker & Docker Compose** (Required for PostgreSQL, Redis, and S3Mock containerized workflow)
- **Git**

---

## 2. Option A: Full Containerized Stack (Docker Compose)

The fastest way to spin up the entire production-like topology (Django API, Celery Worker, Celery Beat, Redis, PostgreSQL, S3Mock, and React Dashboard).

### Step 1: Clone & Configure Environment
```bash
git clone https://github.com/Karthik-bhandarkar/signalbridge.git
cd signalbridge

# Copy environment template
cp .env.example .env
```

### Step 2: Build and Start Containers
```bash
docker compose up --build -d
```

### Step 3: Verify Container Health
```bash
docker compose ps
```
All containers (`signalbridge-web`, `signalbridge-worker`, `signalbridge-beat`, `signalbridge-postgres`, `signalbridge-redis`, `signalbridge-s3mock`) should display `healthy` or `running`.

### Step 4: Run Initial Database Migrations & Create Superuser
```bash
docker compose exec web python manage.py migrate
docker compose exec web python manage.py createsuperuser
```

---

## 3. Option B: Native Host Development (Fast Iteration)

For rapid frontend and backend debugging without running Docker containers.

### Step 1: Python Virtual Environment Setup
```bash
# From workspace root
python -m venv .venv

# On Linux/macOS:
source .venv/bin/activate

# On Windows (PowerShell):
.\.venv\Scripts\Activate.ps1

# Navigate into backend directory
cd backend

# Upgrade pip and install local dependencies
pip install --upgrade pip
pip install -r requirements/local.txt
```

### Step 2: Initialize Database
```bash
python manage.py migrate
python manage.py createsuperuser
```

### Step 3: Launch Services in Separate Terminals

#### Terminal 1: Django API Server (from backend/)
```bash
python manage.py runserver 127.0.0.1:8000
```

#### Terminal 2: Celery Asynchronous Worker
```bash
celery -A config.celery worker --loglevel=info --concurrency=4
```

#### Terminal 3: Celery Periodic Task Scheduler (Beat)
```bash
celery -A config.celery beat --loglevel=info
```

#### Terminal 4: React Operator Dashboard
```bash
cd frontend
npm install
npm run dev
```

---

## 4. Local Service Access Points

| Component | URL | Notes |
| :--- | :--- | :--- |
| **Operator Dashboard** | `http://localhost:3000` | React 19 + TypeScript SPA with live health ping |
| **Backend REST API** | `http://localhost:8000/api/v1/` | Core API root |
| **Swagger UI / OpenAPI** | `http://localhost:8000/api/docs/` | Interactive API documentation |
| **Django Admin Panel** | `http://localhost:8000/admin/` | Model inspection and emergency superuser overrides |
| **Liveness Probe** | `http://localhost:8000/health/live/` | HTTP 200 process check |
| **Readiness Probe** | `http://localhost:8000/health/ready/` | Verifies DB and Redis connectivity |

---

## 5. Verification & Test Execution

### Run Backend Pytest Suite
```bash
# Run all unit, integration, and reliability regression tests
pytest -v

# Run with test coverage report
pytest --cov=apps --cov-report=term-missing
```

### Run Frontend Linting & Production Build
```bash
cd frontend
npm run lint
npm run build
```

### Run Automated System Verification Script
```bash
python scripts/verify_system.py
```
This script exercises:
1. Liveness and readiness probes (`/health/live/`, `/health/ready/`)
2. Database connectivity and query execution
3. Redis latency and atomic key storage
4. Celery broker and result queue availability
5. Incident list and integration API status
