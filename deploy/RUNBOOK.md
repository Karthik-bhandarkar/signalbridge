# SignalBridge Production Deployment & Operations Runbook

**Target Live Environment**: `https://d1soslo0efb36p.cloudfront.net`  
**Distribution Host**: CloudFront CDN Origin -> AWS Application Load Balancer -> EC2 Docker Compose Cluster  
**Target Branch**: `fix/production-ready`

---

## 1. Prerequisites & Access

Ensure you have:
1. SSH access to the SignalBridge EC2 gateway instance.
2. AWS CLI configured with permissions to invalidate CloudFront (`cloudfront:CreateInvalidation`).
3. The rotated admin credentials file located locally at `.private/admin-credentials.txt`.

---

## 2. Step-by-Step Deployment Procedure

### Step 1: Connect to the EC2 Host
```bash
ssh -i <your-ec2-key.pem> ubuntu@<ec2-public-ip-or-dns>
cd /home/ubuntu/signalbridge  # or workspace root on EC2
```

### Step 2: Fetch and Check Out Production-Ready Branch
```bash
git fetch origin
git checkout fix/production-ready
git pull origin fix/production-ready
```

### Step 3: Verify Environment Files
Ensure `.env.production` (or `backend/.env.production`) is present on the host. Verify:
- `DJANGO_ALLOWED_HOSTS` includes `localhost,127.0.0.1,web,nginx,d1soslo0efb36p.cloudfront.net`
- `CSRF_TRUSTED_ORIGINS` includes `https://d1soslo0efb36p.cloudfront.net`
- `CORS_ALLOWED_ORIGINS` includes `https://d1soslo0efb36p.cloudfront.net`

### Step 4: Build and Deploy Updated Docker Containers
Rebuild the production web (Django Gunicorn with 8 worker threads) and frontend (Next.js standalone) containers:
```bash
docker compose -f docker-compose.prod.yml down
docker compose -f docker-compose.prod.yml build --no-cache
docker compose -f docker-compose.prod.yml up -d
```

### Step 5: Run Database Migrations
Apply the user profile schema migration (`0002_userprofile_is_demo_user`):
```bash
docker compose -f docker-compose.prod.yml exec web python manage.py migrate
```

### Step 6: Seed Public Demo Accounts & Secure Admin Account
Run the idempotent seeding command. This creates `demo.operator` and `demo.viewer`, and resets `admin` with the secure password:
```bash
# If .private/admin-credentials.txt is copied to host:
docker compose -f docker-compose.prod.yml exec web python manage.py seed_demo_users
```

### Step 7: Reload Nginx Reverse Proxy
```bash
docker compose -f docker-compose.prod.yml exec nginx nginx -s reload
```

### Step 8: Invalidate CloudFront CDN Cache
Run this command from your local machine or terminal with AWS CLI access:
```bash
# Discover Distribution ID if not known:
aws cloudfront list-distributions --query "DistributionList.Items[?Aliases.Items[?contains(@, 'cloudfront.net')] || contains(DomainName, 'd1soslo0efb36p')].Id" --output text

# Invalidate all cached routes:
aws cloudfront create-invalidation \
  --distribution-id E34EXAMPLE \
  --paths "/*"
```

---

## 3. Post-Deployment Verification (Smoke Tests)

Run these curl commands directly against the live URL to verify the new build is live:

### 1. Verify Deployment Version & Git Commit
```bash
curl -s -i https://d1soslo0efb36p.cloudfront.net/api/v1/version/
```
*Expected*: `HTTP/2 200`, JSON payload with `git_commit`, `build_time`, and `environment: "production"`.

### 2. Verify SSE Live Stream (Fix D5)
```bash
curl -N -H "Accept: text/event-stream" https://d1soslo0efb36p.cloudfront.net/api/v1/stream/
```
*Expected*: `HTTP/2 200`, `content-type: text/event-stream; charset=utf-8`, initial `event: ping` heartbeat. **Zero 406 errors**.

### 3. Verify Public Overview Telemetry & Real Calculated MTTR (Fix D11)
```bash
curl -s https://d1soslo0efb36p.cloudfront.net/api/v1/public/overview/
```
*Expected*: `HTTP/2 200`, JSON with `open_incidents`, `deliveries_24h`, `replay_suppression_rate_pct`, `mttr_minutes`.

### 4. Verify Demo Operator Login & CSRF Rotation (Fix D1, D2, D4)
```bash
# Obtain fresh CSRF token
curl -c cookies.txt -s https://d1soslo0efb36p.cloudfront.net/api/v1/auth/csrf/

# Extract CSRF token and perform login
CSRF=$(grep csrftoken cookies.txt | awk '{print $7}')
curl -b cookies.txt -c cookies.txt -X POST https://d1soslo0efb36p.cloudfront.net/api/v1/auth/login/ \
  -H "Content-Type: application/json" \
  -H "X-CSRFToken: $CSRF" \
  -d '{"username":"demo.operator","password":"OperatorDemo@2026!"}'
```
*Expected*: `HTTP/2 200`, `{"status":"success","user":{"username":"demo.operator","role":"OPERATOR","is_demo_user":true}}`.

### 5. Run Automated E2E Suite Against Live URL
```bash
npm run test:e2e
```

---

## 4. Rollback Plan

If an unrecoverable failure occurs during the release:
```bash
# 1. Check out previous known good commit or main
git checkout main

# 2. Restart previous build
docker compose -f docker-compose.prod.yml down
docker compose -f docker-compose.prod.yml up -d

# 3. Re-invalidate CloudFront
aws cloudfront create-invalidation --distribution-id <ID> --paths "/*"
```
