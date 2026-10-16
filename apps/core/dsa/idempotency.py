"""
===================================================================================
SignalBridge — DSA Module 1: Hash Tables & In-Memory Redis Idempotency
===================================================================================
PURPOSE:
    This module provides O(1) in-memory idempotency deduplication using deterministic
    SHA-256 payload hashing and Redis atomic 'SET key value EX ttl NX' operations.

FIRST PRINCIPLES: WHY IDEMPOTENCY MATTERS IN DISTRIBUTED SYSTEMS
    1. The "At-Least-Once" Delivery Guarantee:
       External monitoring platforms (PagerDuty, Datadog, Prometheus Alertmanager)
       retry webhook deliveries whenever they encounter network jitter, client socket
       resets, or response delays exceeding their 5-second timeouts. Consequently,
       SignalBridge will inevitably receive duplicate HTTP POST dispatches for the
       exact same incident event.

    2. The Problem with Direct Database Deduplication:
       If an alert storm fires 1,000 duplicated requests per second:
       - Hitting PostgreSQL for each duplicate triggers heavy B-Tree index lookups,
         row locking contention, and WAL write pressure.
       - Spawning a Celery background task for each duplicate pollutes the Redis queue
         and consumes CPU worker threads doing redundant deduplication queries.

    3. The Solution: Sub-Millisecond In-Memory Redis Deduplication Gate:
       - Hash Table Principle: By mapping an arbitrary JSON payload into a fixed 256-bit
         (64-character hex) deterministic fingerprint, we achieve O(1) key lookups.
       - Atomic In-Memory Operation: Redis runs single-threaded for command execution.
         Executing 'SET idemp:<hash> <meta> EX 60 NX' (Set if Not Exists with 60s TTL)
         guarantees that exactly ONE request succeeds (returns True/OK), while all
         concurrent or subsequent duplicate requests fail atomically (return None).
       - Fast ACK: Duplicate requests receive an immediate HTTP 200 OK without
         touching PostgreSQL or spawning Celery background tasks.

TIME & SPACE COMPLEXITY:
    - Fingerprint Generation: O(N) where N is payload byte length (SHA-256 streaming).
    - Redis Key Lookup & Set: O(1) time complexity (Hash Table lookup).
    - Memory Overhead: O(K) space where K is the number of unique webhooks in 60s.
      Keys auto-expire via TTL, preventing memory leaks in Redis.
===================================================================================
"""
import hashlib
import json
import logging
import os
from typing import Any, Dict, Optional, Tuple, Union

import redis
from django.conf import settings

logger = logging.getLogger(__name__)


def generate_payload_fingerprint(
    payload: Union[bytes, str, Dict[str, Any], list],
    source_slug: str = "",
) -> str:
    """
    Computes a deterministic, collision-resistant SHA-256 fingerprint from an arbitrary payload.

    Args:
        payload: Raw request bytes, JSON string, or parsed Python dictionary/list.
        source_slug: Optional source namespace (e.g., 'pagerduty') to prevent cross-source collisions.

    Returns:
        A 64-character lowercase hexadecimal SHA-256 digest string.

    Algorithmic Details:
        - When a Python dictionary is supplied, key ordering can be arbitrary.
          We use `json.dumps(payload, sort_keys=True, separators=(',', ':'))`
          to guarantee identical JSON representations regardless of key insertion order.
        - When raw bytes are supplied (e.g., `request.body`), we stream them directly
          into the SHA-256 hasher to preserve exact byte-for-byte fidelity.
    """
    hasher = hashlib.sha256()

    # Prepend source namespace if provided:
    if source_slug:
        hasher.update(f"{source_slug}:".encode("utf-8"))

    if isinstance(payload, bytes):
        hasher.update(payload)
    elif isinstance(payload, str):
        hasher.update(payload.encode("utf-8"))
    elif isinstance(payload, (dict, list)):
        # Canonical JSON serialization: sorted keys and compact separators:
        canonical_json = json.dumps(payload, sort_keys=True, separators=(",", ":"))
        hasher.update(canonical_json.encode("utf-8"))
    else:
        # Fallback for unexpected scalar types:
        hasher.update(str(payload).encode("utf-8"))

    return hasher.hexdigest()


class IdempotencyManager:
    """
    Manages O(1) in-memory idempotency deduplication backed by Redis.

    Features:
        - Atomic 'SET key value EX ttl NX' execution preventing race conditions.
        - Configurable TTL (default 60 seconds).
        - Automatic fallback for test environments or temporary Redis connectivity issues.
        - Tracking metadata storage (tracking_id, first_seen_at) to return on duplicates.
    """

    DEFAULT_TTL_SECONDS: int = 60
    KEY_PREFIX: str = "idemp"

    def __init__(self, redis_client: Optional[redis.Redis] = None, default_ttl: int = 60):
        """
        Initializes the IdempotencyManager.

        Args:
            redis_client: Optional explicit redis.Redis instance. If None, resolves from environment/settings.
            default_ttl: Expiration time in seconds for idempotency keys.
        """
        self.default_ttl = default_ttl
        self._redis_client = redis_client
        self._fallback_memory_cache: Dict[str, Tuple[str, float]] = {}

    def _get_redis(self) -> Optional[redis.Redis]:
        """
        Lazily initializes and returns the Redis connection pool.
        """
        if self._redis_client is not None:
            return self._redis_client

        # In testing mode without live Redis, return None to trigger fallback:
        if getattr(settings, "TESTING", False):
            return None

        redis_url = getattr(settings, "REDIS_URL", os.getenv("REDIS_URL", "redis://redis:6379/0"))
        try:
            self._redis_client = redis.Redis.from_url(redis_url, decode_responses=True)
            return self._redis_client
        except Exception as exc:
            logger.warning(
                f"[IdempotencyManager] Failed to connect to Redis at '{redis_url}': {exc}. "
                "Failing open with fallback cache."
            )
            return None

    def build_key(self, source_slug: str, fingerprint: str) -> str:
        """
        Constructs the namespaced Redis key for an idempotency check.

        Format: idemp:<source_slug>:<fingerprint>
        Example: idemp:pagerduty:5cb4a11e2a9bab2123768c6623f52b7069f0616eba177b312cd7a125935d2676
        """
        return f"{self.KEY_PREFIX}:{source_slug}:{fingerprint}"

    def check_and_set(
        self,
        key: str,
        ttl_seconds: Optional[int] = None,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> Tuple[bool, Optional[Dict[str, Any]]]:
        """
        Atomically checks if a key exists and sets it if not present (SET ... EX ... NX).

        Args:
            key: Namespaced idempotency key (from `build_key`).
            ttl_seconds: Expiration TTL in seconds (defaults to self.default_ttl).
            metadata: Optional dictionary with tracking metadata (tracking_id, timestamp).

        Returns:
            Tuple[bool, Optional[Dict[str, Any]]]:
                - (True, None): FRESH EVENT. Key did not exist and was successfully acquired.
                - (False, existing_metadata): DUPLICATE DETECTED. Key already exists in Redis.

        Concurrency Guarantee:
            Because Redis executes commands in an atomic single-threaded event loop,
            if 20 concurrent threads attempt `SET key val EX 60 NX` simultaneously,
            exactly ONE thread will receive True. The remaining 19 threads will receive None.
            This completely eliminates race conditions without distributed locks.
        """
        ttl = ttl_seconds if ttl_seconds is not None else self.default_ttl
        serialized_data = json.dumps(metadata or {})
        client = self._get_redis()

        if client is not None:
            try:
                # Redis command: SET <key> <serialized_data> EX <ttl> NX
                # Returns True if key was set (fresh event), None if key already existed (duplicate).
                is_acquired = client.set(key, serialized_data, ex=ttl, nx=True)

                if is_acquired:
                    # FRESH EVENT: Lock successfully acquired
                    return True, None
                else:
                    # DUPLICATE DETECTED: Fetch existing metadata stored during the first call
                    existing_raw = client.get(key)
                    existing_meta = None
                    if existing_raw:
                        try:
                            existing_meta = json.loads(existing_raw)
                        except (json.JSONDecodeError, TypeError):
                            existing_meta = {"raw": existing_raw}
                    return False, existing_meta

            except (redis.ConnectionError, redis.TimeoutError) as err:
                logger.error(
                    f"[IdempotencyManager] Redis error during idempotency check for key '{key}': {err}. "
                    "Failing open to allow ingestion."
                )
                # Fail-open: If Redis is temporarily unreachable, do not drop critical production alerts!
                return True, None

        # Fallback for Unit Tests (in-memory simulation):
        import time
        now = time.time()
        if key in self._fallback_memory_cache:
            data_str, expiry = self._fallback_memory_cache[key]
            if now < expiry:
                # Key still active: Duplicate!
                try:
                    return False, json.loads(data_str)
                except Exception:
                    return False, {}
            else:
                # Expired key: Clear it
                del self._fallback_memory_cache[key]

        # Record in fallback cache:
        self._fallback_memory_cache[key] = (serialized_data, now + ttl)
        return True, None

    def get_ttl(self, key: str) -> int:
        """
        Returns the remaining time-to-live (in seconds) for an active idempotency key.

        Returns:
            - Positive integer: Remaining TTL in seconds.
            - -1: Key exists without expiration (should not occur).
            - -2: Key does not exist.
        """
        client = self._get_redis()
        if client is not None:
            try:
                return client.ttl(key)
            except Exception as err:
                logger.warning(f"[IdempotencyManager] Failed to get TTL for '{key}': {err}")
                return -2
        return -2

    def release(self, key: str) -> bool:
        """
        Explicitly removes an idempotency key before TTL expiration.
        Used if downstream processing encounters a fatal unrecoverable error
        and the producer must be allowed to immediately retry.
        """
        client = self._get_redis()
        if client is not None:
            try:
                return bool(client.delete(key))
            except Exception as err:
                logger.warning(f"[IdempotencyManager] Failed to delete key '{key}': {err}")
                return False

        if key in self._fallback_memory_cache:
            del self._fallback_memory_cache[key]
            return True
        return False

    def clear(self) -> None:
        """
        Clears all in-memory fallback keys and test keys in Redis.
        Used primarily in automated test fixtures and teardowns.
        """
        self._fallback_memory_cache.clear()
        client = self._get_redis()
        if client is not None:
            try:
                for k in client.scan_iter(f"{self.KEY_PREFIX}:*"):
                    client.delete(k)
            except Exception as err:
                logger.warning(f"[IdempotencyManager] Failed to clear keys: {err}")


# Global default instance for application-wide reuse:
idempotency_manager = IdempotencyManager(default_ttl=60)
