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

## 3. Post-Deployment Verification (One-Command Smoke Test)

Run the unified automated smoke test directly against the live URL:

```bash
python scripts/smoke_test_live.py --url https://d1soslo0efb36p.cloudfront.net
```

This single command executes and validates all 5 mission-critical flows:
1. **Version & Commit SHA**: Confirms `GET /api/v1/version/` returns HTTP 200 with matching git commit and production environment.
2. **Public 24h Telemetry**: Confirms `GET /api/v1/public/overview/` returns clean unauthenticated metrics (deliveries, open incidents, MTTR, replay suppression) without 500 errors or secret leaks.
3. **Operator Authentication**: Requests fresh CSRF token and executes `POST /api/v1/auth/login/` with `demo.operator`, verifying session cookies and `OPERATOR` role.
4. **Simulator Dispatch**: Dispatches synthetic `payment_gateway_saturation` webhook via `POST /api/v1/simulator/dispatch/` with authenticated session and rotated CSRF token.
5. **SSE Stream**: Connects to `GET /api/v1/stream/` over HTTP/2, validates `text/event-stream; charset=utf-8`, receives initial handshake, and disconnects gracefully.

---

## 4. Terraform Origin Lock: Two-Phase Rollout & Rollback Order (Fix D9)

To prevent traffic interruption while CloudFront edge locations deploy origin configuration changes (~3-5 minutes), apply Terraform in two explicit phases:

### Phase 1: Apply Permissive Origin Injection (CloudFront First)
Deploy CloudFront custom header injection and `CloudFront-Forwarded-Proto` forwarding while ALB listener rules remain permissive:
```bash
cd terraform
# Apply CloudFront distribution changes only:
terraform apply -target=aws_cloudfront_distribution.app_distribution -target=random_password.origin_secret
```
*Verification*: Check EC2 Nginx access logs to verify incoming requests contain header `X-Origin-Verify` and `CloudFront-Forwarded-Proto: https`.

### Phase 2: Enforce Strict ALB Origin Lock
Once CloudFront has updated, deploy the dedicated security group and strict ALB listener enforcement:
```bash
# Apply dedicated ALB security group (prefix list quota protection) and strict listener rule:
terraform apply -target=aws_security_group.alb_dedicated_sg -target=aws_lb_listener.http -target=aws_lb_listener_rule.origin_verify
```
*Verification*:
- Direct ALB HTTP requests: `curl -I http://<alb-dns-name>/` returns `HTTP 403 Access Denied`.
- CloudFront HTTPS requests: `curl -I https://d1soslo0efb36p.cloudfront.net/health/live/` returns `HTTP 200 OK`.

### Rollback Order for Origin Lock
If CloudFront or the ALB experiences routing degradation:
1. **Revert Phase 2 First**: Switch `aws_lb_listener.http` default action back to `forward` target group `app_tg`:
   ```bash
   terraform apply -target=aws_lb_listener.http
   ```
2. **Revert Phase 1**: Revert CloudFront distribution origin headers if necessary.

---

## 5. Emergency Full Rollback Plan

If an unrecoverable failure occurs during the application release:
```bash
# 1. Check out previous known good commit or main
git checkout main

# 2. Restart previous build
docker compose -f docker-compose.prod.yml down
docker compose -f docker-compose.prod.yml up -d

# 3. Re-invalidate CloudFront
aws cloudfront create-invalidation --distribution-id <ID> --paths "/*"
```

