#!/usr/bin/env bash
# =============================================================================
# SignalBridge — Automated EC2 Application Deployment Script
# =============================================================================
# Run this script directly on your deployed EC2 instance:
#   bash scripts/deploy_to_aws.sh
# =============================================================================
set -e

echo "======================================================================"
echo "SIGNALBRIDGE PRODUCTION DEPLOYMENT BOOTSTRAPPER"
echo "======================================================================"

if [ ! -f ".env.production" ]; then
    echo "ERROR: .env.production file is missing!"
    echo "Please copy .env.production.example to .env.production and populate your RDS & Redis endpoints."
    exit 1
fi

echo "[1/5] Building and launching production containers (Nginx, Gunicorn, Celery)..."
docker compose --env-file .env.production -f docker-compose.prod.yml up -d --build

echo "[2/5] Waiting 15s for database connectivity and Gunicorn startup..."
sleep 15

echo "[3/5] Applying database migrations to Amazon RDS..."
docker compose -f docker-compose.prod.yml exec -T web python manage.py migrate --noinput

echo "[4/5] Collecting static assets for Nginx..."
docker compose -f docker-compose.prod.yml exec -T web python manage.py collectstatic --noinput

echo "[5/5] Ensuring default webhook source exists in RDS..."
docker compose -f docker-compose.prod.yml exec -T web python manage.py shell -c "
from apps.webhooks.models import WebhookSource
src, created = WebhookSource.objects.get_or_create(
    slug='pagerduty',
    defaults={'name': 'PagerDuty Production', 'secret_key': 'secret-token-123', 'is_active': True}
)
print(f'WebhookSource pagerduty: {\"Created\" if created else \"Already exists\"}')
"

echo "======================================================================"
echo "DEPLOYMENT COMPLETE!"
echo "Check health: curl http://localhost/health/ready/"
echo "======================================================================"
