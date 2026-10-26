"""
===================================================================================
SignalBridge — Enterprise Production Settings
===================================================================================
PURPOSE:
    Hardened production configuration for SignalBridge running in Oracle Cloud Infrastructure (OCI Compute / OKE) or container runtimes.
    Enforces zero-trust security postures, HTTPS redirection, strict HTTP cookies,
    persistent database connection pooling, and externalized secrets.
===================================================================================
"""
import os
from .base import *  # noqa: F403

# ---------------------------------------------------------------------------------
# 1. CORE OPERATIONAL TOGGLES
# ---------------------------------------------------------------------------------
DEBUG = False

# Fail loudly if secret key is missing in production:
SECRET_KEY = os.environ.get("DJANGO_SECRET_KEY")
if not SECRET_KEY:
    raise RuntimeError("CRITICAL: DJANGO_SECRET_KEY environment variable must be set in production.")

raw_allowed_hosts = os.environ.get("DJANGO_ALLOWED_HOSTS", "")
if not raw_allowed_hosts:
    raise RuntimeError("CRITICAL: DJANGO_ALLOWED_HOSTS environment variable must be set in production.")
ALLOWED_HOSTS = [host.strip() for host in raw_allowed_hosts.split(",") if host.strip()]

# ---------------------------------------------------------------------------------
# 2. BROWSER & TRANSPORT LAYER SECURITY (TLS / HTTPS)
# ---------------------------------------------------------------------------------
# Enforce HTTPS redirect (can be disabled behind TLS-terminating ALBs with SSL header inspection):
SECURE_SSL_REDIRECT = os.environ.get("DJANGO_SECURE_SSL_REDIRECT", "true").lower() in ("true", "1")
SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")

# HTTP Strict Transport Security (HSTS):
SECURE_HSTS_SECONDS = int(os.environ.get("DJANGO_SECURE_HSTS_SECONDS", 31536000))  # 1 Year
SECURE_HSTS_INCLUDE_SUBDOMAINS = True
SECURE_HSTS_PRELOAD = True

# Browser Defense Headers:
SECURE_CONTENT_TYPE_NOSNIFF = True
SECURE_BROWSER_XSS_FILTER = True
X_FRAME_OPTIONS = "DENY"

# Cookie Security (Mitigate XSS & MITM session hijacking):
SESSION_COOKIE_SECURE = True
SESSION_COOKIE_HTTPONLY = True
SESSION_COOKIE_SAMESITE = "Lax"

CSRF_COOKIE_SECURE = True
CSRF_COOKIE_HTTPONLY = False  # Allows SPA JavaScript to inspect token if needed
CSRF_COOKIE_SAMESITE = "Lax"

# Cross-Origin Resource Sharing (CORS) & CSRF Trusted Origins in Production
raw_csrf = os.environ.get("CSRF_TRUSTED_ORIGINS", "")
if raw_csrf:
    CSRF_TRUSTED_ORIGINS = [origin.strip() for origin in raw_csrf.split(",") if origin.strip()]
else:
    CSRF_TRUSTED_ORIGINS = []
    for host in ALLOWED_HOSTS:
        if host not in ("*", "localhost", "127.0.0.1", "web"):
            CSRF_TRUSTED_ORIGINS.extend([f"http://{host}", f"https://{host}"])

raw_cors = os.environ.get("CORS_ALLOWED_ORIGINS", "")
if raw_cors:
    CORS_ALLOWED_ORIGINS = [origin.strip() for origin in raw_cors.split(",") if origin.strip()]
else:
    CORS_ALLOWED_ORIGINS = list(CSRF_TRUSTED_ORIGINS)
CORS_ALLOW_CREDENTIALS = True

# ---------------------------------------------------------------------------------
# 3. PRODUCTION DATABASE POOLING (PostgreSQL 16)
# ---------------------------------------------------------------------------------
DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.postgresql",
        "NAME": os.environ.get("POSTGRES_DB", "signalbridge_db"),
        "USER": os.environ.get("POSTGRES_USER", "postgres"),
        "PASSWORD": os.environ.get("POSTGRES_PASSWORD", ""),
        "HOST": os.environ.get("POSTGRES_HOST", "postgres"),
        "PORT": os.environ.get("POSTGRES_PORT", "5432"),
        "CONN_MAX_AGE": int(os.environ.get("DJANGO_DB_CONN_MAX_AGE", 600)),
        "OPTIONS": {
            "sslmode": os.environ.get("POSTGRES_SSLMODE", "prefer"),
        },
    }
}

# ---------------------------------------------------------------------------------
# 4. DISTRIBUTED CACHE & MESSAGE BROKERS (Redis 7)
# ---------------------------------------------------------------------------------
REDIS_URL = os.environ.get("REDIS_URL", "redis://redis:6379/0")

CACHES = {
    "default": {
        "BACKEND": "django.core.cache.backends.redis.RedisCache",
        "LOCATION": REDIS_URL,
    }
}

CELERY_BROKER_URL = os.environ.get("CELERY_BROKER_URL", "redis://redis:6379/1")
CELERY_RESULT_BACKEND = os.environ.get("CELERY_RESULT_BACKEND", "redis://redis:6379/2")

# ---------------------------------------------------------------------------------
# 5. COLD OBJECT STORAGE ARCHIVAL (AWS S3)
# ---------------------------------------------------------------------------------
AWS_ACCESS_KEY_ID = os.environ.get("AWS_ACCESS_KEY_ID")
AWS_SECRET_ACCESS_KEY = os.environ.get("AWS_SECRET_ACCESS_KEY")
AWS_STORAGE_BUCKET_NAME = os.environ.get("AWS_STORAGE_BUCKET_NAME", "signalbridge-production-archives")
AWS_DEFAULT_REGION = os.environ.get("AWS_DEFAULT_REGION", "us-east-1")
AWS_S3_REGION_NAME = os.environ.get("AWS_S3_REGION_NAME", AWS_DEFAULT_REGION)
AWS_S3_ENDPOINT_URL = os.environ.get("AWS_S3_ENDPOINT_URL") or None

# ---------------------------------------------------------------------------------
# 6. ENTERPRISE LOGGING CONFIGURATION
# ---------------------------------------------------------------------------------
LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "formatters": {
        "json": {
            "format": "%(asctime)s [%(levelname)s] %(name)s: %(message)s",
        },
    },
    "handlers": {
        "console": {
            "class": "logging.StreamHandler",
            "formatter": "json",
        },
    },
    "root": {
        "handlers": ["console"],
        "level": os.environ.get("DJANGO_LOG_LEVEL", "INFO"),
    },
    "loggers": {
        "django.security": {
            "handlers": ["console"],
            "level": "WARNING",
            "propagate": False,
        },
        "apps": {
            "handlers": ["console"],
            "level": "INFO",
            "propagate": False,
        },
    },
}
