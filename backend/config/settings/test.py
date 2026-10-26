"""
Fast test runner settings for SignalBridge.
"""
from .local import *  # noqa: F403
from .local import BASE_DIR  # noqa: F401
import os

# Default to SQLite for fast local headless test execution unless USE_POSTGRES is explicitly enabled
if os.getenv("USE_POSTGRES", "false").lower() not in ("true", "1", "yes"):
    DATABASES = {
        "default": {
            "ENGINE": "django.db.backends.sqlite3",
            "NAME": ":memory:",
        }
    }


DEBUG = False
TESTING = True

PASSWORD_HASHERS = [
    "django.contrib.auth.hashers.MD5PasswordHasher",  # Speeds up test user creation by 10x
]

CACHES = {
    "default": {
        "BACKEND": "django.core.cache.backends.locmem.LocMemCache",
        "LOCATION": "signalbridge-test-cache",
    }
}

# Execute Celery tasks synchronously in memory during unit tests
CELERY_TASK_ALWAYS_EAGER = True
CELERY_TASK_EAGER_PROPAGATES = True
