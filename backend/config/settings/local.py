"""
Local development settings for SignalBridge running in Docker.
"""
import os
from dotenv import load_dotenv
from .base import *  # noqa: F403

# Load local environment variables from .env file (checked in backend/ or root)
env_path = BASE_DIR / ".env"
if not env_path.exists() and (BASE_DIR.parent / ".env").exists():
    env_path = BASE_DIR.parent / ".env"
load_dotenv(env_path)  # noqa: F405

DEBUG = True

ALLOWED_HOSTS = ["*"]

# Primary Operational Database: PostgreSQL 16 (or SQLite fallback when USE_SQLITE=true)
if os.getenv("USE_SQLITE", "false").lower() in ("true", "1", "yes"):
    DATABASES = {
        "default": {
            "ENGINE": "django.db.backends.sqlite3",
            "NAME": BASE_DIR / "db.sqlite3",
        }
    }
    CACHES = {
        "default": {
            "BACKEND": "django.core.cache.backends.locmem.LocMemCache",
            "LOCATION": "signalbridge-local-cache",
        }
    }
else:
    DATABASES = {
        "default": {
            "ENGINE": "django.db.backends.postgresql",
            "NAME": os.getenv("POSTGRES_DB", "signalbridge_db"),
            "USER": os.getenv("POSTGRES_USER", "postgres"),
            "PASSWORD": os.getenv("POSTGRES_PASSWORD", "postgres"),
            "HOST": os.getenv("POSTGRES_HOST", "postgres"),
            "PORT": os.getenv("POSTGRES_PORT", "5432"),
            "CONN_MAX_AGE": 60,  # Persistent database connections (60 seconds)
        }
    }
    CACHES = {
        "default": {
            "BACKEND": "django.core.cache.backends.redis.RedisCache",
            "LOCATION": os.getenv("REDIS_URL", "redis://redis:6379/0"),
        }
    }

# Celery Task Broker & Result Backend
CELERY_BROKER_URL = os.getenv("CELERY_BROKER_URL", "redis://redis:6379/1")
CELERY_RESULT_BACKEND = os.getenv("CELERY_RESULT_BACKEND", "redis://redis:6379/2")

# S3 / Object Storage Configuration (Local S3Mock)
AWS_ACCESS_KEY_ID = os.getenv("AWS_ACCESS_KEY_ID", "test")
AWS_SECRET_ACCESS_KEY = os.getenv("AWS_SECRET_ACCESS_KEY", "test")
AWS_STORAGE_BUCKET_NAME = os.getenv("AWS_STORAGE_BUCKET_NAME", "signalbridge-raw-archives")
AWS_S3_ENDPOINT_URL = os.getenv("AWS_S3_ENDPOINT_URL", "http://s3:9090")
AWS_S3_REGION_NAME = os.getenv("AWS_S3_REGION_NAME", "us-east-1")

# Webhook Cryptographic Secret
WEBHOOK_SIGNING_SECRET = os.getenv("WEBHOOK_SIGNING_SECRET", "development_signing_secret_do_not_use_in_prod")
