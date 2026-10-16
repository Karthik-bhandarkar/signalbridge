"""
===================================================================================
SignalBridge Webhook Ingestion Engine — Celery Distributed Task Broker Setup
===================================================================================
PURPOSE:
    Celery is an enterprise distributed task queue. It allows SignalBridge to
    process heavy computational workloads (such as HMAC verification, deduplication,
    and alert aggregation) in the background WITHOUT delaying HTTP response times.

THE SUB-100MS LATENCY ARCHITECTURE:
    1. Client (e.g., PagerDuty) sends a POST request with webhook data.
    2. Django API view immediately enqueues a Celery task into Redis.
    3. Django returns an HTTP 202 Accepted response in < 25 milliseconds.
    4. An asynchronous Celery worker process picks up the task from Redis and
       saves it to PostgreSQL and S3 in the background.
===================================================================================
"""
# Standard Library OS module for accessing environment variables
import os

# Celery application class
from celery import Celery

# ---------------------------------------------------------------------------------
# 1. SET THE ACTIVE DJANGO SETTINGS MODULE
# ---------------------------------------------------------------------------------
# Ensures Celery workers have access to Django's database connections and app models.
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.local")

# ---------------------------------------------------------------------------------
# 2. INSTANTIATE THE CELERY APPLICATION
# ---------------------------------------------------------------------------------
# 'signalbridge' is the master namespace for tasks created by this project.
app = Celery("signalbridge")

# ---------------------------------------------------------------------------------
# 3. CONFIGURE FROM DJANGO SETTINGS
# ---------------------------------------------------------------------------------
# 'django.conf:settings' tells Celery to pull all configuration directly from Django.
# namespace='CELERY' means any setting starting with 'CELERY_' in settings/base.py
# (such as CELERY_BROKER_URL, CELERY_RESULT_BACKEND) is automatically loaded.
app.config_from_object("django.conf:settings", namespace="CELERY")

# ---------------------------------------------------------------------------------
# 4. AUTOMATIC TASK DISCOVERY
# ---------------------------------------------------------------------------------
# Inspects every app in INSTALLED_APPS (apps.webhooks, apps.alerts, etc.) and
# automatically imports any file named 'tasks.py' without manual registration.
app.autodiscover_tasks()


# ---------------------------------------------------------------------------------
# 5. DIAGNOSTIC HEARTBEAT TASK
# ---------------------------------------------------------------------------------
@app.task(bind=True, ignore_result=True)
def debug_task(self):
    """
    Diagnostic task to verify that Celery workers and Redis broker are connected.
    Usage: debug_task.delay()
    """
    print(f"SignalBridge Celery Heartbeat: Request {self.request.id!r}")

