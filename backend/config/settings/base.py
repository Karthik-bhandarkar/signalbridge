"""
Base settings shared across all environments for SignalBridge.
"""
import os
from pathlib import Path

# Build paths inside the project like this: BASE_DIR / 'subdir'.
# BASE_DIR points to the project root directory
BASE_DIR = Path(__file__).resolve().parent.parent.parent

# Quick-start development settings - unsuitable for production
# See https://docs.djangoproject.com/en/5.0/howto/deployment/checklist/

SECRET_KEY = os.getenv(
    "DJANGO_SECRET_KEY",
    "django-insecure-development-key-change-in-production-123456789"
)

DEBUG = False

ALLOWED_HOSTS = os.getenv("DJANGO_ALLOWED_HOSTS", "localhost,127.0.0.1,web,0.0.0.0").split(",")


# Application definition

DJANGO_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
]

THIRD_PARTY_APPS = [
    "rest_framework",
    "corsheaders",
    "drf_spectacular",
]

LOCAL_APPS = [
    "apps.core",
    "apps.webhooks",
    "apps.alerts",
    "apps.analytics",
    "apps.monitoring",
    "apps.notifications",
]

INSTALLED_APPS = DJANGO_APPS + THIRD_PARTY_APPS + LOCAL_APPS

MIDDLEWARE = [
    "corsheaders.middleware.CorsMiddleware",
    "django.middleware.security.SecurityMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

# -----------------------------------------------------------------------------
# Cross-Origin Resource Sharing (CORS) & CSRF Trusted Origins
# -----------------------------------------------------------------------------
CORS_ALLOW_CREDENTIALS = True
CORS_ALLOWED_ORIGINS = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "http://localhost:5173",
    "http://127.0.0.1:5173",
]
CSRF_TRUSTED_ORIGINS = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "http://localhost:5173",
    "http://127.0.0.1:5173",
]

ROOT_URLCONF = "config.urls"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [BASE_DIR / "templates"],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.debug",
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

WSGI_APPLICATION = "config.wsgi.application"


# Password validation
# https://docs.djangoproject.com/en/5.0/ref/settings/#auth-password-validators

AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator"},
    {"NAME": "django.contrib.auth.password_validation.MinimumLengthValidator"},
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
]


# Internationalization & Timestamps (STRICT INVARIANT: UTC Everywhere)
# https://docs.djangoproject.com/en/5.0/topics/i18n/

LANGUAGE_CODE = "en-us"
TIME_ZONE = "UTC"
USE_I18N = True
USE_TZ = True


# Static files (CSS, JavaScript, Images)
# https://docs.djangoproject.com/en/5.0/howto/static-files/

STATIC_URL = "static/"
STATIC_ROOT = BASE_DIR / "staticfiles"

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"


# Django REST Framework (DRF) Production Configuration
REST_FRAMEWORK = {
    "DEFAULT_SCHEMA_CLASS": "drf_spectacular.openapi.AutoSchema",
    "DEFAULT_RENDERER_CLASSES": [
        "rest_framework.renderers.JSONRenderer",
        "rest_framework.renderers.BrowsableAPIRenderer",
    ],
    "DEFAULT_PARSER_CLASSES": [
        "rest_framework.parsers.JSONParser",
    ],
    "DEFAULT_AUTHENTICATION_CLASSES": [
        "rest_framework.authentication.SessionAuthentication",
    ],
    "DEFAULT_PERMISSION_CLASSES": [
        "rest_framework.permissions.IsAuthenticated",
    ],
}

# Swagger / OpenAPI 3.0 Documentation Configuration (drf-spectacular)
SPECTACULAR_SETTINGS = {
    "TITLE": "SignalBridge Webhook Ingestion API",
    "DESCRIPTION": "High-throughput webhook ingestion, deduplication, and incident grouping engine.",
    "VERSION": "1.0.0",
    "SERVE_INCLUDE_SCHEMA": False,
}

# Celery 5.4+ Asynchronous Task Queue Configuration
CELERY_TIMEZONE = "UTC"
CELERY_TASK_TRACK_STARTED = True
CELERY_TASK_TIME_LIMIT = 30 * 60  # 30 minutes hard timeout
CELERY_ACCEPT_CONTENT = ["json"]
CELERY_TASK_SERIALIZER = "json"
CELERY_RESULT_SERIALIZER = "json"
CELERY_ACKS_LATE = True  # Late ACK: Tasks acknowledged only after successful completion

# Celery Beat Periodic Task Schedules
CELERY_BEAT_SCHEDULE = {
    "rollup-ingestion-metrics-every-minute": {
        "task": "apps.analytics.tasks.rollup_ingestion_metrics",
        "schedule": 60.0,
    },
    "dispatch-scheduled-monitors-every-30s": {
        "task": "apps.monitoring.tasks.dispatch_scheduled_monitors",
        "schedule": 30.0,
    },
    "reconcile-pending-webhooks-every-2m": {
        "task": "apps.webhooks.tasks.reconcile_pending_webhooks",
        "schedule": 120.0,
        "kwargs": {"age_minutes": 2},
    },
    "reclaim-stale-processing-webhooks-every-5m": {
        "task": "apps.webhooks.tasks.reclaim_stale_processing_webhooks",
        "schedule": 300.0,
        "kwargs": {"stale_minutes": 5},
    },
}

# -----------------------------------------------------------------------------
# OpenAPI 3.0 Documentation Settings (drf-spectacular)
# -----------------------------------------------------------------------------
SPECTACULAR_SETTINGS = {
    "TITLE": "SignalBridge Webhook Ingestion Engine API",
    "DESCRIPTION": "Enterprise High-Throughput Webhook Ingestion & Incident Correlation Engine",
    "VERSION": "1.0.0",
    "SERVE_INCLUDE_SCHEMA": False,
    "ENUM_NAME_OVERRIDES": {
        "AlertSeverityEnum": "apps.alerts.models.Alert.SeverityLevel",
        "IncidentSeverityEnum": "apps.alerts.models.Incident.SeverityLevel",
        "IncidentStatusEnum": "apps.alerts.models.Incident.IncidentStatus",
        "DeliveryStatusEnum": "apps.notifications.models.NotificationDelivery.DeliveryStatus",
        "DestinationTypeEnum": "apps.notifications.models.NotificationDestination.DestinationType",
        "MonitorHealthStatusEnum": "apps.monitoring.models.Monitor.HealthStatus",
        "MonitorTypeEnum": "apps.monitoring.models.Monitor.MonitorType",
        "ServiceTierEnum": "apps.monitoring.models.Service.ServiceTier",
    },
}

