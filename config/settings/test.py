"""
Fast test runner settings for SignalBridge.
"""
from .local import *  # noqa: F403
from .local import BASE_DIR, DATABASES  # noqa: F401

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
