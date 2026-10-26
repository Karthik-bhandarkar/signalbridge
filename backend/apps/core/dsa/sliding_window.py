"""
===================================================================================
SignalBridge — DSA Module 2: Sliding Window Rate Limiting (collections.deque)
===================================================================================
PURPOSE:
    This module implements the Sliding Window Log algorithmic pattern using Python's
    double-ended queue ('collections.deque') to detect alert storms and enforce burst
    rate limits per webhook source service in O(1) amortized time.

FIRST PRINCIPLES: FIXED WINDOW VS. SLIDING WINDOW
    1. The "Border Burst" Vulnerability in Fixed Window Counters:
       Suppose a service allows 100 requests per 60-second window.
       In a naive fixed-window counter (e.g. tracking requests in calendar minutes):
         - An alert storm fires 100 requests at 11:59:59 AM (Minute 1: count=100 -> OK).
         - The clock ticks to 12:00:00 AM, resetting the counter to 0.
         - The storm fires another 100 requests at 12:00:01 AM (Minute 2: count=100 -> OK).
       Result: 200 requests passed within a 2-second boundary window!
       The upstream API was subjected to double its maximum capacity.

    2. The Sliding Window Log Pattern:
       Instead of coarse minute buckets, we maintain a continuous, rolling timeline of
       timestamps for each service.
       For any new request arriving at timestamp T:
         - Window Horizon: [T - window_size, T]
         - Expired Eviction: Pop any timestamp strictly older than (T - window_size).
         - Threshold Evaluation: If the number of surviving timestamps >= max_requests,
           the request is denied (HTTP 429 Too Many Requests).
         - Record & Allow: Otherwise, append T to the right and allow the request.

TIME & SPACE COMPLEXITY ANALYSIS:
    - Time Complexity: O(1) amortized per request.
      Each request timestamp is pushed to the deque once (O(1)) and popped from the
      left once (O(1)) when it expires.
      Unlike 'list.pop(0)' which takes O(N) by shifting elements in memory,
      'collections.deque.popleft()' is strictly O(1) in CPython.
    - Space Complexity: O(W) per tracked key, where W is the burst capacity.
      Stale timestamps are aggressively pruned, ensuring bounded memory usage.
===================================================================================
"""
import logging
import threading
import time
from collections import defaultdict, deque
from typing import Any, Callable, Dict, Optional, Tuple

logger = logging.getLogger(__name__)


class SlidingWindowRateLimiter:
    """
    Thread-Safe In-Memory Sliding Window Rate Limiter using collections.deque.

    Maintains a double-ended queue of floating-point POSIX timestamps per key
    (e.g., webhook source slug). Prunes expired timestamps on the fly.
    """

    DEFAULT_WINDOW_SECONDS: int = 60

    def __init__(
        self,
        default_limit: int = 120,
        default_window_seconds: int = 60,
        time_func: Optional[Callable[[], float]] = None,
    ):
        """
        Initializes the sliding window rate limiter.

        Args:
            default_limit: Maximum allowed requests within the time window.
            default_window_seconds: Sliding window duration in seconds (default 60s).
            time_func: Clock source function (defaults to time.time). Injected in tests.
        """
        self.default_limit = default_limit
        self.default_window_seconds = default_window_seconds
        self.time_func = time_func or time.time

        # Hash map storing a deque of timestamps for each key:
        # Key format: source_slug (e.g., 'pagerduty', 'datadog')
        self._windows: Dict[str, deque] = defaultdict(deque)

        # Thread synchronization lock ensuring concurrency safety in multi-threaded workers:
        self._lock = threading.Lock()

    def is_allowed(
        self,
        key: str,
        limit: Optional[int] = None,
        window_seconds: Optional[int] = None,
        current_time: Optional[float] = None,
    ) -> Tuple[bool, Dict[str, Any]]:
        """
        Evaluates whether a request is permitted under the sliding window limit.

        Args:
            key: Rate limiting bucket identifier (e.g., 'pagerduty').
            limit: Maximum allowed requests (defaults to self.default_limit).
            window_seconds: Duration of the rolling window (defaults to self.default_window_seconds).
            current_time: Optional explicit timestamp (useful for simulated tests).

        Returns:
            Tuple[bool, Dict[str, Any]]:
                - bool: True if request is allowed, False if rate-limited (HTTP 429).
                - Dict[str, Any]: Diagnostic rate-limit metadata:
                    {
                        "limit": int,
                        "remaining": int,
                        "current_count": int,
                        "retry_after": int,      # Seconds until oldest request expires
                        "reset_after": int,
                    }

        Algorithmic Steps (Amortized O(1)):
            1. Calculate cutoff time = now - window_seconds.
            2. Evict expired entries from the left of the deque (O(1) popleft).
            3. If len(deque) >= limit: Deny request, calculate retry_after from oldest timestamp.
            4. If len(deque) < limit: Append now to the right (O(1) append), allow request.
        """
        max_allowed = limit if limit is not None else self.default_limit
        window = window_seconds if window_seconds is not None else self.default_window_seconds
        now = current_time if current_time is not None else self.time_func()
        cutoff_time = now - window

        with self._lock:
            queue = self._windows[key]

            # Step 1: Evict timestamps older than the rolling window horizon:
            while queue and queue[0] <= cutoff_time:
                queue.popleft()

            current_count = len(queue)

            # Step 2: Evaluate limit threshold:
            if current_count >= max_allowed:
                # RATE LIMIT EXCEEDED: Calculate retry_after seconds:
                oldest_timestamp = queue[0]
                retry_after = max(1, int((oldest_timestamp + window) - now) + 1)
                logger.warning(
                    f"[RateLimiter] Key '{key}' exceeded limit ({current_count}/{max_allowed} in {window}s). "
                    f"Retry after: {retry_after}s"
                )
                return False, {
                    "limit": max_allowed,
                    "remaining": 0,
                    "current_count": current_count,
                    "retry_after": retry_after,
                    "reset_after": retry_after,
                }

            # Step 3: Request permitted: Record current timestamp:
            queue.append(now)
            remaining = max_allowed - (current_count + 1)

            return True, {
                "limit": max_allowed,
                "remaining": remaining,
                "current_count": current_count + 1,
                "retry_after": 0,
                "reset_after": window,
            }

    def get_current_count(self, key: str, window_seconds: Optional[int] = None) -> int:
        """
        Returns the number of active, unexpired requests in the current rolling window.
        """
        window = window_seconds if window_seconds is not None else self.default_window_seconds
        cutoff_time = self.time_func() - window

        with self._lock:
            queue = self._windows.get(key)
            if not queue:
                return 0
            while queue and queue[0] <= cutoff_time:
                queue.popleft()
            return len(queue)

    def clear(self, key: Optional[str] = None) -> None:
        """
        Clears timestamps for a specific key, or resets all keys.
        Used primarily in test fixtures and operational cache flushes.
        """
        with self._lock:
            if key is not None:
                self._windows.pop(key, None)
            else:
                self._windows.clear()


class RedisSlidingWindowRateLimiter:
    """
    Distributed, thread-safe, and multi-process sliding window rate limiter backed by Redis.
    Uses Redis Sorted Sets (ZSET) to record timestamps atomically.
    Falls back gracefully to SlidingWindowRateLimiter if Redis is unavailable or during tests.
    """

    KEY_PREFIX = "ratelimit"
    _SENTINEL = object()

    def __init__(
        self,
        default_limit: int = 120,
        default_window_seconds: int = 60,
        redis_client: Any = _SENTINEL,
    ):
        self.default_limit = default_limit
        self.default_window_seconds = default_window_seconds
        self._explicit_client = redis_client is not self._SENTINEL
        self._redis_client = redis_client if self._explicit_client else None
        self._fallback = SlidingWindowRateLimiter(default_limit, default_window_seconds)

    def _get_redis(self):
        if self._explicit_client:
            return self._redis_client
        try:
            import os
            import redis
            from django.conf import settings
            if getattr(settings, "TESTING", False):
                return None
            redis_url = getattr(settings, "REDIS_URL", os.getenv("REDIS_URL", "redis://redis:6379/0"))
            self._redis_client = redis.Redis.from_url(redis_url, decode_responses=True)
            return self._redis_client
        except Exception as exc:
            logger.warning(f"[RedisRateLimiter] Could not connect to Redis: {exc}. Using fallback.")
            return None

    def is_allowed(
        self,
        key: str,
        limit: Optional[int] = None,
        window_seconds: Optional[int] = None,
        current_time: Optional[float] = None,
    ) -> Tuple[bool, Dict[str, Any]]:
        max_allowed = limit if limit is not None else self.default_limit
        window = window_seconds if window_seconds is not None else self.default_window_seconds
        now = current_time if current_time is not None else time.time()
        cutoff_time = now - window

        client = self._get_redis()
        if client is None:
            # Fallback to in-memory deque limiter:
            return self._fallback.is_allowed(key, max_allowed, window, now)

        redis_key = f"{self.KEY_PREFIX}:{key}"
        try:
            # Atomic pipeline evaluation:
            pipe = client.pipeline()
            # 1. Remove timestamps older than the sliding window:
            pipe.zremrangebyscore(redis_key, 0, cutoff_time)
            # 2. Count surviving requests in the window:
            pipe.zcard(redis_key)
            # 3. Fetch oldest timestamp to calculate retry_after:
            pipe.zrange(redis_key, 0, 0, withscores=True)
            _, current_count, oldest_entries = pipe.execute()

            if current_count >= max_allowed:
                oldest_score = oldest_entries[0][1] if oldest_entries else now
                retry_after = max(1, int((oldest_score + window) - now) + 1)
                return False, {
                    "limit": max_allowed,
                    "remaining": 0,
                    "current_count": current_count,
                    "retry_after": retry_after,
                    "reset_after": retry_after,
                }

            # Request permitted: Record current timestamp with microsecond nonce:
            member = f"{now}:{time.time_ns()}"
            pipe = client.pipeline()
            pipe.zadd(redis_key, {member: now})
            pipe.expire(redis_key, window + 10)
            pipe.execute()

            remaining = max(0, max_allowed - (current_count + 1))
            return True, {
                "limit": max_allowed,
                "remaining": remaining,
                "current_count": current_count + 1,
                "retry_after": 0,
                "reset_after": window,
            }
        except Exception as exc:
            logger.error(f"[RedisRateLimiter] Error evaluating rate limit for '{key}': {exc}. Failing open.")
            # Fail-open: do not drop critical webhooks if Redis has an issue
            return True, {
                "limit": max_allowed,
                "remaining": max_allowed - 1,
                "current_count": 1,
                "retry_after": 0,
                "reset_after": window,
            }

    def clear(self, key: Optional[str] = None) -> None:
        self._fallback.clear(key)
        client = self._get_redis()
        if client is not None:
            try:
                if key:
                    client.delete(f"{self.KEY_PREFIX}:{key}")
                else:
                    for k in client.scan_iter(f"{self.KEY_PREFIX}:*"):
                        client.delete(k)
            except Exception:
                pass


# Global in-memory deque instance (preserved for Step 11 DSA educational verification):
sliding_window_limiter = SlidingWindowRateLimiter(default_limit=120, default_window_seconds=60)

# Global distributed Redis rate limiter for production multi-process gateways:
shared_rate_limiter = RedisSlidingWindowRateLimiter(default_limit=120, default_window_seconds=60)

