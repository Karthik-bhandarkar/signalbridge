# ☁️ SignalBridge: Complete Master AWS Deployment & Engineering Guide
## The Definitive A-to-Z Handbook: Architecture, Cost Safety, Hands-On Lab & AWS Skills

> **Author:** SignalBridge DevOps & Cloud Architecture  
> **Prerequisites:** An active AWS account ([aws.amazon.com](https://aws.amazon.com))  
> **Target Cost:** $0.00 – $3.50 / month (100% covered by your $100 credit for ~28 months)  
> **Target Audience:** From beginners to production engineers  

---

# 📑 Master Table of Contents

1. [The "A to Z" AWS Skills You Master in This Project](#1-the-a-to-z-aws-skills-you-master-in-this-project)
2. [High-Risk Cost Traps & The $5.00 Safety Net](#2-high-risk-cost-traps--the-500-safety-net)
3. [File Map: Where Every File Goes on the Cloud Server](#3-file-map-where-every-file-goes-on-the-cloud-server)
4. [Step-by-Step Hands-On Lab Manual (Labs 1 through 7)](#4-step-by-step-hands-on-lab-manual)
   - [Lab 1: AWS Budgets & $5.00 Guardrail](#lab-1-aws-budgets--500-guardrail)
   - [Lab 2: S3 Object Storage & Scoped Least-Privilege IAM](#lab-2-s3-object-storage--scoped-least-privilege-iam)
   - [Lab 3: Provision Compute Host & Firewall (Lightsail)](#lab-3-provision-compute-host--firewall-lightsail)
   - [Lab 4: Linux Kernel Swap & Docker Host Prep](#lab-4-linux-kernel-swap--docker-host-prep)
   - [Lab 5: Deploy SignalBridge Container Cluster](#lab-5-deploy-signalbridge-container-cluster)
   - [Lab 6: Frontend Build & Nginx Reverse Proxy with HTTPS](#lab-6-frontend-build--nginx-reverse-proxy-with-https)
   - [Lab 7: Smoke Testing, Live Verification & Outbox Audit](#lab-7-smoke-testing-live-verification--outbox-audit)
5. [Maintenance, Database Backup to S3 & Tear-Down Guide](#5-maintenance-database-backup-to-s3--tear-down-guide)

---

# 1. The "A to Z" AWS Skills You Master in This Project

When speaking with recruiters, hiring managers, or senior cloud architects, this project showcases deep, real-world engineering across the entire AWS ecosystem:

| Letter | Cloud Skill / Technology | How It Is Implemented in SignalBridge |
| :--- | :--- | :--- |
| **A** | **AWS Budgets & Cost Governance** | Automated programmatic email alarm triggering at $5.00 to guarantee credit preservation. |
| **B** | **Bucket Policies & S3 Cold Archival** | Private S3 bucket storing raw webhook payloads (`archives/{source}/{YYYY}/{MM}/{DD}/`), keeping PostgreSQL lean. |
| **C** | **Compute & Container Orchestration** | Multi-container Docker Compose running PostgreSQL 16, Redis 7, Django Gunicorn, Celery Worker, and Celery Beat. |
| **D** | **DNS & Static IP Networking** | Lightsail static IPv4 routing, reverse proxy host mapping, and CORS/CSRF trusted origins. |
| **E** | **Environment Secrets Isolation** | `.gitignore` rules shielding secrets; Linux shell generation of cryptographically secure 256-bit keys. |
| **F** | **Firewall & Security Groups** | Defense-in-depth: only ports 22, 80, 443 exposed publicly; DB (5432) and Redis (6379) bound strictly to internal bridge. |
| **G** | **Gunicorn WSGI Concurrency Tuning** | Multi-worker, multi-threaded WSGI process management with `/health/live/` probes. |
| **H** | **HTTPS & SSL/TLS Termination** | Nginx reverse proxy terminating TLS 1.3 with automated Let's Encrypt Certbot certificates. |
| **I** | **IAM Least-Privilege Architecture** | Custom JSON IAM policies restricted specifically to single-bucket ARN actions (`s3:PutObject`, `s3:GetObject`). |
| **J** | **JSON Payload Partitioning** | Date-partitioned hierarchical cloud storage offload preserving sub-millisecond database queries. |
| **K** | **Kernel Swap Memory Engineering** | Linux 4GB Swapfile creation preventing Out-Of-Memory (OOM) kills on cost-effective 1GB instances. |
| **L** | **Logging & Health Telemetry** | Kubernetes-ready liveness (`/health/live/`) and readiness (`/health/ready/`) telemetry monitored by React SPA. |
| **M** | **Metadata Protection & SSRF Defense** | Outbound synthetic monitoring filter rejecting requests to AWS metadata IP (`169.254.169.254`) and loopbacks. |
| **N** | **Nginx Layer 7 Reverse Proxy** | High-performance routing: serves compiled React SPA static files directly; proxies `/api/` to Gunicorn. |
| **O** | **Object Storage Lifecycle Rules** | S3 lifecycle policies automatically expiring or transitioning raw payloads to Glacier after retention windows. |
| **P** | **PostgreSQL & Redis Zero-Exposure** | ACID relational storage and Redis in-memory broker with `noeviction` policy, completely air-gapped from internet. |
| **R** | **Reliability & Idempotent Recovery** | Celery tasks dispatched strictly via `transaction.on_commit()`; automated stale work recovery sweeps. |
| **S** | **Security Hardening (HMAC-SHA256)** | Constant-time cryptographic signature verification (`hmac.compare_digest`) defeating timing side-channel attacks. |
| **T** | **Testing & CI/CD Verification** | 113-test Pytest test suite, zero-lint oxlint frontend build, and automated end-to-end smoke tests. |

---

# 2. High-Risk Cost Traps & The $5.00 Safety Net

### ⚠️ Services That Drain $100 Credits (Do NOT Provision These)
* **AWS NAT Gateways:** $32.40/month baseline per gateway. *(We use a direct Internet Gateway: $0.00)*.
* **Application Load Balancers (ALB):** $22.00/month baseline. *(We use Nginx on host: $0.00)*.
* **AWS ElastiCache Redis:** $13.50/month (No permanent free tier). *(We use containerized Redis 7: $0.00)*.
* **AWS RDS PostgreSQL:** $15.00–$25.00/month. *(We use containerized PostgreSQL 16 on persistent volume: $0.00)*.
* **Unattached Elastic IPs:** $0.005/hr if left idle. *(Lightsail includes static IP for $0.00)*.

### 💡 The Lean Architecture We Use
- **Compute Host:** AWS Lightsail 1 vCPU / 512MB–1GB RAM ($3.50/month flat). Includes static IP, 1TB bandwidth, 20GB SSD.
- **Object Storage:** AWS S3 Standard (Free tier: 5GB storage, 20k GET, 2k PUT free every month).
- **Total Monthly Cost:** **$3.50 flat**. Your $100 credit lasts for **28 continuous months**!

---

# 3. File Map: Where Every File Goes on the Cloud Server

```text
/home/ubuntu/signalbridge/           <-- Root project directory on cloud server
├── backend/                         <-- Python Django & Celery application
│   ├── apps/                        <-- Webhooks, alerts, monitoring, notifications
│   ├── config/                      <-- Django settings (local, production, base)
│   └── Dockerfile                   <-- Multi-stage production container build
├── frontend/                        <-- React 19 + TypeScript source
│   └── dist/                        <-- Static compiled assets (HTML, CSS, JS) served by Nginx
├── docker-compose.prod.yml          <-- Production container orchestrator
├── .env                             <-- Production secrets & AWS S3 keys (Never committed!)
├── scripts/                         <-- Database backup and verification scripts
└── /etc/nginx/sites-available/      <-- Nginx configuration routing port 80/443 to frontend & API
```

---

# 4. Step-by-Step Hands-On Lab Manual

---

## Lab 1: AWS Budgets & $5.00 Guardrail

### Objective
Create a hard automated billing guardrail that sends an alert to your email the moment charges exceed $5.00.

1. Log into **[AWS Management Console](https://console.aws.amazon.com/)**.
2. In the top search bar, type: `Budgets` and select **AWS Budgets**.
3. Click the orange **Create budget** button (top right).
4. Under **Budget setup**:
   - Choose: **Use a template (simplified)**.
   - Choose: **Monthly cost budget**.
5. Under **Budget details**:
   - Budget name: `signalbridge-cost-guard`
   - Set budgeted amount: `5` ($5.00 USD).
   - Email recipients: Enter your personal email address.
6. Click **Create budget** at the bottom.  
   *Checkpoint: The budget appears in the list with state `OK`.*

---

## Lab 2: S3 Object Storage & Scoped Least-Privilege IAM

### Objective
Create a private S3 bucket for cold raw webhook JSON archives, and generate an IAM user with a custom, strictly scoped security policy (no broad `AmazonS3FullAccess`).

#### Part A: Create the S3 Bucket
1. In the top search bar, type: `S3` and click **S3**.
2. Click **Create bucket**.
3. Enter a globally unique bucket name (lowercase letters, numbers, hyphens):
   - Example: `signalbridge-archives-YOURNAME-2026`
4. AWS Region: Select `us-east-1` (US East, N. Virginia) or your closest region.
5. Under **Block Public Access settings for this bucket**:
   - Ensure **"Block all public access"** is **CHECKED** (keeps files private).
6. Click **Create bucket** at the bottom.
7. Note down your bucket name in a text file:
   ```text
   MY_BUCKET_NAME = signalbridge-archives-YOURNAME-2026
   MY_AWS_REGION  = us-east-1
   ```

#### Part B: Create the Scoped Least-Privilege IAM Policy
1. In the top search bar, type: `IAM` and click **IAM**.
2. In the left sidebar, click **Policies** ➔ Click **Create policy**.
3. Click the **JSON** tab, delete everything in the box, and paste this exact policy (replace `YOUR_EXACT_BUCKET_NAME` with your bucket name from Part A):
   ```json
   {
       "Version": "2012-10-17",
       "Statement": [
           {
               "Sid": "SignalBridgeBucketList",
               "Effect": "Allow",
               "Action": [
                   "s3:ListBucket",
                   "s3:GetBucketLocation"
               ],
               "Resource": "arn:aws:s3:::YOUR_EXACT_BUCKET_NAME"
           },
           {
               "Sid": "SignalBridgeObjectReadWrite",
               "Effect": "Allow",
               "Action": [
                   "s3:PutObject",
                   "s3:GetObject",
                   "s3:DeleteObject"
               ],
               "Resource": "arn:aws:s3:::YOUR_EXACT_BUCKET_NAME/*"
           }
       ]
   }
   ```
4. Click **Next** ➔ Policy name: `SignalBridgeS3ScopedPolicy` ➔ Click **Create policy**.

#### Part C: Create the Service User & Access Key
1. In the left IAM sidebar, click **Users** ➔ Click **Create user**.
2. User name: `signalbridge-s3-service-account` ➔ Click **Next**.
3. Under **Set permissions**:
   - Select **Attach policies directly**.
   - Search for: `SignalBridgeS3ScopedPolicy`
   - Check the checkbox next to it ➔ Click **Next** ➔ Click **Create user**.
4. In the users table, click on `signalbridge-s3-service-account`.
5. Click on the **Security credentials** tab.
6. Scroll down to **Access keys** ➔ Click **Create access key**.
7. Choose: **Application running outside AWS** ➔ Click **Next** ➔ Click **Create access key**.
8. **Save these credentials securely in a private text note (do not share or commit them):**
   ```text
   AWS_ACCESS_KEY_ID = AKIA................
   AWS_SECRET_ACCESS_KEY = wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY
   ```
9. Click **Done**.

---

## Lab 3: Provision Compute Host & Firewall (Lightsail)

### Objective
Launch a virtual Ubuntu 24.04 server, open web ports 80/443, and attach a permanent free static IP address.

1. In the top search bar, type: `Lightsail` and click **Lightsail**.
2. Click **Create instance**.
3. Platform: **Linux/Unix**.
4. Blueprint: **OS Only** ➔ select **Ubuntu 24.04 LTS**.
5. Instance plan: Select the **$3.50 USD / month** plan.
6. Identify your instance: Name it `signalbridge-prod-vm`.
7. Click **Create instance** at the bottom.
8. Wait 60–90 seconds until the status displays **Running** (green dot).

#### Configure Firewall Rules:
9. Click on the instance card: `signalbridge-prod-vm`.
10. Click the **Networking** tab.
11. Under **IPv4 Firewall**, port 22 (SSH) is already present.
    - Click **+ Add rule** ➔ Application: **HTTP (Port 80)** ➔ Click **Create**.
    - Click **+ Add rule** ➔ Application: **HTTPS (Port 443)** ➔ Click **Create**.

#### Attach Free Static IP:
12. On the same **Networking** tab, scroll to **IPv4 networking** ➔ Click **Attach static IP**.
13. Name it: `signalbridge-static-ip` ➔ Click **Create and attach**.
14. Note down your static IP address:
    ```text
    SERVER_STATIC_IP = 54.210.xxx.xxx
    ```

---

## Lab 4: Linux Kernel Swap & Docker Host Prep

### Objective
Open the browser terminal directly in Lightsail, configure a 4GB Swapfile (to prevent Out-Of-Memory container kills), and install Docker.

1. On your Lightsail instance card, click the **`>_` (terminal icon)**. A black browser terminal opens automatically.

2. **Step 4A: Allocate 4GB Virtual Swap Memory:**  
   Copy and paste this entire block into the terminal and press Enter:
   ```bash
   sudo fallocate -l 4G /swapfile
   sudo chmod 600 /swapfile
   sudo mkswap /swapfile
   sudo swapon /swapfile
   echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
   free -h
   ```
   *Verification Check:* Under `Swap:`, it will show `4.0Gi`.

3. **Step 4B: Install Docker Engine, Git, Nginx, and Certbot:**  
   Copy and paste this command block into the terminal and press Enter:
   ```bash
   sudo apt-get update && sudo apt-get upgrade -y
   sudo apt-get install -y docker.io docker-compose-v2 git nginx certbot python3-certbot-nginx
   sudo usermod -aG docker ubuntu
   newgrp docker
   ```
   *Verification Check:* Run `docker --version`. It displays `Docker version 24.x` or `26.x`.

---

## Lab 5: Deploy SignalBridge Container Cluster

### Objective
Clone the repository onto the server, generate cryptographically random secrets, configure `.env`, and start the hardened container cluster.

1. **Clone the repository on the server:**
   ```bash
   git clone https://github.com/Karthik-bhandarkar/signalbridge.git
   cd signalbridge
   ```

2. **Generate Cryptographically Secure Secrets:**  
   Run these 3 generator commands in your terminal:
   ```bash
   python3 -c "import secrets; print('SECRET_KEY=' + secrets.token_urlsafe(50))"
   python3 -c "import secrets; print('DB_PASS=' + secrets.token_hex(16))"
   python3 -c "import secrets; print('WEBHOOK_SECRET=' + secrets.token_hex(24))"
   ```
   *(Keep these 3 values ready to paste into `.env`)*

3. **Create the Production `.env` file:**
   ```bash
   nano .env
   ```
   Paste the following template into nano, substituting your real values:
   ```env
   # Django Production Settings
   DJANGO_SETTINGS_MODULE=config.settings.production
   DJANGO_SECRET_KEY=PASTE_GENERATED_SECRET_KEY_HERE
   DJANGO_DEBUG=False
   # Replace with your actual server static IP from Lab 3:
   DJANGO_ALLOWED_HOSTS=YOUR_STATIC_IP,127.0.0.1,localhost,web
   DJANGO_SECURE_SSL_REDIRECT=false

   # PostgreSQL 16 (Internal only - no public ports)
   POSTGRES_DB=signalbridge_db
   POSTGRES_USER=postgres
   POSTGRES_PASSWORD=PASTE_GENERATED_DB_PASS_HERE
   POSTGRES_HOST=postgres
   POSTGRES_PORT=5432

   # Redis 7 & Celery Broker (Internal only)
   REDIS_URL=redis://redis:6379/0
   CELERY_BROKER_URL=redis://redis:6379/1
   CELERY_RESULT_BACKEND=redis://redis:6379/2
   CELERY_CONCURRENCY=2

   # S3 Payload Cold Archival (From Lab 2)
   AWS_STORAGE_BUCKET_NAME=YOUR_BUCKET_NAME_HERE
   AWS_ACCESS_KEY_ID=YOUR_AWS_ACCESS_KEY_ID_HERE
   AWS_SECRET_ACCESS_KEY=YOUR_AWS_SECRET_ACCESS_KEY_HERE
   AWS_S3_REGION_NAME=us-east-1

   # Security & Networking
   WEBHOOK_SIGNING_SECRET=PASTE_GENERATED_WEBHOOK_SECRET_HERE
   PROD_WEB_PORT=8001
   ```
   - Press **`Ctrl + O`**, then **`Enter`** (Save).
   - Press **`Ctrl + X`** (Exit).

4. **Launch the Container Cluster:**
   ```bash
   docker compose -f docker-compose.prod.yml up -d --build
   ```
   *(Wait ~2-3 minutes for Docker to complete the image build)*

5. **Verify All 5 Containers Are Healthy:**
   ```bash
   docker compose -f docker-compose.prod.yml ps
   ```
   You will see:
   - `signalbridge_postgres_prod` (healthy)
   - `signalbridge_redis_prod` (healthy)
   - `signalbridge_web_prod` (Up, listening on 127.0.0.1:8001)
   - `signalbridge_celery_worker_prod` (Up)
   - `signalbridge_celery_beat_prod` (Up)

6. **Apply Database Migrations:**
   ```bash
   docker compose -f docker-compose.prod.yml exec web python manage.py migrate
   ```

7. **Create Your Production Admin Account:**
   ```bash
   docker compose -f docker-compose.prod.yml exec -it web python manage.py createsuperuser
   ```
   *(Enter your desired username, email, and password when prompted)*

---

## Lab 6: Frontend Build & Nginx Reverse Proxy with HTTPS

### Objective
Install Node.js, compile the React SPA, configure Nginx to route traffic, and establish SSL/TLS encryption.

1. **Install Node.js 20 & npm on the server:**
   ```bash
   curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
   sudo apt-get install -y nodejs
   ```

2. **Compile the React Dashboard:**
   ```bash
   cd ~/signalbridge/frontend
   npm install
   npm run build
   cd ..
   ```
   *Verification Check:* Confirm `~/signalbridge/frontend/dist` exists with an `index.html` file (`ls -la frontend/dist`).

3. **Configure Nginx:**
   ```bash
   sudo nano /etc/nginx/sites-available/signalbridge
   ```
   Paste this configuration:
   ```nginx
   server {
       listen 80;
       server_name _;

       # Serve static React Operator Dashboard
       location / {
           root /home/ubuntu/signalbridge/frontend/dist;
           index index.html;
           try_files $uri $uri/ /index.html;
       }

       # Reverse Proxy for Django REST API & Health Probes
       location ~ ^/(api|health|admin)/ {
           proxy_pass http://127.0.0.1:8001;
           proxy_set_header Host $host;
           proxy_set_header X-Real-IP $remote_addr;
           proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
           proxy_set_header X-Forwarded-Proto $scheme;
           proxy_read_timeout 90;
       }
   }
   ```
   - Press **`Ctrl + O`**, then **`Enter`** (Save).
   - Press **`Ctrl + X`** (Exit).

4. **Activate Site & Reload Nginx:**
   ```bash
   sudo rm -f /etc/nginx/sites-enabled/default
   sudo ln -sf /etc/nginx/sites-available/signalbridge /etc/nginx/sites-enabled/
   sudo nginx -t
   sudo systemctl restart nginx
   ```
   *Expected Output:* `nginx: configuration file /etc/nginx/nginx.conf test is successful`.

---

## Lab 7: Smoke Testing, Live Verification & Outbox Audit

### Objective
Access your production dashboard via your static IP, test health telemetry, and fire a real webhook.

1. **Open in Browser:**
   Type your server IP in your web browser:
   ```text
   http://YOUR_SERVER_STATIC_IP
   ```
   - The **Operations Mission Control** dashboard loads!
   - Top status displays **`SYSTEM HEALTHY`** (with green telemetry pulse).
   - Click **Operator Login** (top right) and log in with your superuser credentials.

2. **Run Health Check Test in Terminal:**
   ```bash
   curl http://127.0.0.1:8001/health/ready/
   ```
   *Expected Output:*
   ```json
   {"status":"ready","checks":{"database":{"status":"ok","vendor":"postgresql"},"redis":{"status":"ok"}}}
   ```

3. **Fire a Real Test Webhook Signal:**
   ```bash
   curl -X POST http://127.0.0.1:8001/api/v1/webhooks/raw/ \
     -H "Content-Type: application/json" \
     -H "X-Source-Slug: datadog" \
     -d '{"event":"high_latency_alarm","service":"payment-gateway","severity":"critical","latency_ms":1250}'
   ```
   *Expected Output:*
   ```json
   {"status":"accepted","action":"queued_for_processing"}
   ```
   Look at your browser dashboard: the **Active Incidents** and **Ingested Signals** counters will increment in real time!

---

# 5. Maintenance, Database Backup to S3 & Tear-Down Guide

### 💾 Running an Automated Database Backup to S3
Run this command anytime (or set it in cron) to dump PostgreSQL and upload it directly to your S3 bucket:
```bash
bash scripts/backup_db.sh
```

### 🛑 How to Stop or Tear Down (When Not in Use)
If you ever want to pause or delete the instance to preserve 100% of your credits:
- **To Pause (Stop Billing for Compute):** Go to Lightsail Console ➔ Click `...` on instance ➔ Click **Stop**.
- **To Delete Everything (Zero Billing):** Go to Lightsail Console ➔ Click `...` ➔ Click **Delete**. Then go to S3 and delete the bucket.
