# 🚀 SignalBridge Local Execution Guide (Step-by-Step)

This guide walks you through running the entire **SignalBridge** platform on your local machine.

---

## 📋 Prerequisites Check

Before starting, verify what tools are installed on your machine:

1. **Python**: `python --version` (3.11, 3.12, or 3.13)
2. **Node.js & npm**: `node -v` (v18+ or v20+) and `npm -v`
3. **Docker Desktop** (Recommended): `docker --version` and `docker compose version`

---

## 🐳 Method 1: Containerized with Docker Compose (Recommended)

This is the easiest and most reliable method because it starts all dependencies (**PostgreSQL 16**, **Redis 7**, **S3Mock**, **Django API**, and **Celery Worker**) with a single command.

### Step 1: Open Terminal in the Project Root
Ensure you are in `c:\MindForge\Project\01_SignalBridge_Webhook_Ingestion`.

### Step 2: Prepare Environment File
Check if `.env` exists. If not, copy it from `.env.example`:
```powershell
Copy-Item .env.example .env
```

### Step 3: Build & Start All Containers
```powershell
docker compose up -d --build
```

### Step 4: Verify Containers Are Running & Healthy
```powershell
docker compose ps
```
You should see:
- `signalbridge_postgres` (healthy)
- `signalbridge_redis` (healthy)
- `signalbridge_s3` (running on port 9090)
- `signalbridge_web` (running on port 8000)
- `signalbridge_worker` (running Celery)

### Step 5: Run Database Migrations
```powershell
docker compose exec web python manage.py migrate
```

### Step 6: Create an Admin (Superuser)
```powershell
docker compose exec -it web python manage.py createsuperuser
```
*(Enter username, email, and password when prompted)*

### Step 7: Start the Frontend Operator Dashboard
Open a new terminal window, navigate to the `frontend` folder, and start the Vite dev server:
```powershell
cd frontend
npm install
npm run dev
```

### Step 8: Access the Services
- 🌐 **Operator Dashboard**: [http://localhost:3000](http://localhost:3000) (log in with the superuser credentials created above)
- 🔌 **Backend REST API**: [http://localhost:8000/api/v1/](http://localhost:8000/api/v1/)
- 📖 **Swagger / OpenAPI Docs**: [http://localhost:8000/api/docs/](http://localhost:8000/api/docs/)
- ⚙️ **Django Admin Portal**: [http://localhost:8000/admin/](http://localhost:8000/admin/)
- 🩺 **Readiness Health Check**: [http://localhost:8000/health/ready/](http://localhost:8000/health/ready/)

---

## 💻 Method 2: Native Host Development (Without Docker)

If you prefer to run services natively on Windows:

### Step 1: Activate Python Virtual Environment
```powershell
# In project root:
.\.venv\Scripts\Activate.ps1
```

### Step 2: Install Backend Dependencies
```powershell
cd backend
pip install -r requirements/local.txt
```

### Step 3: Configure Database & Settings
If you do not have local PostgreSQL and Redis installed, you can run tests and local server using the test runner settings (SQLite in-memory) or start lightweight Redis/Postgres.
To run migrations and server with local SQLite:
```powershell
# Set DJANGO_SETTINGS_MODULE to test or local
$env:DJANGO_SETTINGS_MODULE="config.settings.test"
python manage.py migrate
python manage.py createsuperuser
```

### Step 4: Run the Backend API Server
```powershell
python manage.py runserver 127.0.0.1:8000
```

### Step 5: Run the Frontend (in a separate terminal)
```powershell
cd frontend
npm install
npm run dev
```

---

## 🧪 Method 3: Running Automated Test Suites & Verification

### 1. Run Backend Pytest Suite
```powershell
cd backend
pytest -v
```
*(Runs 113+ automated tests validating HMAC authentication, rate limiting, deduplication, and alert correlation).*

### 2. Run Frontend Build & Lint Checks
```powershell
cd frontend
npm run lint
npm run build
```

### 3. Run Automated System Health Verification
```powershell
python scripts/verify_system.py
```

---

## 🛑 Stopping Docker Services
When you are done testing:
```powershell
docker compose down
```
*(To preserve database volumes, do NOT pass `-v`)*
