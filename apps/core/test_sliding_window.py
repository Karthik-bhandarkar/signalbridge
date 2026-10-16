"""
===================================================================================
SignalBridge — DSA Module 2: Sliding Window Rate Limiting Unit Tests
===================================================================================
Tests for:
    1. Sliding window burst limit enforcement (collections.deque).
    2. Simulated time expiration and O(1) eviction of stale timestamps.
    3. Multi-source namespace isolation.
    4. Thread-safety under concurrent access.
===================================================================================
"""
import threading
from django.test import SimpleTestCase
from apps.core.dsa.sliding_window import SlidingWindowRateLimiter


class SlidingWindowDSATestCase(SimpleTestCase):
    """
    Unit tests for SlidingWindowRateLimiter algorithmic behavior.
    """

    def setUp(self):
        self.simulated_time = 1000.0

        def mock_clock():
            return self.simulated_time

        self.limiter = SlidingWindowRateLimiter(
            default_limit=5,
            default_window_seconds=60,
            time_func=mock_clock,
        )

    def test_burst_within_limit_allowed(self):
        """
        Verify that requests up to the maximum limit within the window are all allowed.
        """
        key = "pagerduty"
        for i in range(5):
            allowed, info = self.limiter.is_allowed(key=key, limit=5, window_seconds=60)
            self.assertTrue(allowed, f"Request {i+1} should be allowed")
            self.assertEqual(info["remaining"], 4 - i)

        self.assertEqual(self.limiter.get_current_count(key), 5)

    def test_request_exceeding_limit_denied_with_retry_after(self):
        """
        Verify that the 6th request within the 60s window is denied with retry_after.
        """
        key = "pagerduty"
        # Exhaust 5 tokens:
        for _ in range(5):
            self.limiter.is_allowed(key=key, limit=5, window_seconds=60)

        # 6th request at the same timestamp:
        allowed, info = self.limiter.is_allowed(key=key, limit=5, window_seconds=60)
        self.assertFalse(allowed)
        self.assertEqual(info["remaining"], 0)
        self.assertGreaterEqual(info["retry_after"], 1)

    def test_sliding_window_expiration_allows_new_requests(self):
        """
        Verify that when time advances past the 60s window, expired timestamps
        are evicted from the deque and new requests are permitted.
        """
        key = "pagerduty"
        # Send 5 requests at T = 1000.0:
        for _ in range(5):
            self.limiter.is_allowed(key=key, limit=5, window_seconds=60)

        # Confirm blocked at T = 1030.0 (30 seconds later):
        self.simulated_time = 1030.0
        allowed_at_30, _ = self.limiter.is_allowed(key=key, limit=5, window_seconds=60)
        self.assertFalse(allowed_at_30)

        # Advance clock to T = 1061.0 (61 seconds after initial burst):
        self.simulated_time = 1061.0
        # The initial 5 timestamps are now older than 60s (cutoff = 1001.0) and get evicted!
        allowed_at_61, info = self.limiter.is_allowed(key=key, limit=5, window_seconds=60)
        self.assertTrue(allowed_at_61)
        self.assertEqual(info["remaining"], 4)

    def test_multi_key_isolation(self):
        """
        Verify that rate limits on one service do not affect another service.
        """
        # Exhaust limit on pagerduty:
        for _ in range(5):
            self.limiter.is_allowed(key="pagerduty", limit=5)

        # Assert pagerduty is blocked:
        blocked, _ = self.limiter.is_allowed(key="pagerduty", limit=5)
        self.assertFalse(blocked)

        # Assert datadog is still fresh and allowed:
        fresh_allowed, info = self.limiter.is_allowed(key="datadog", limit=5)
        self.assertTrue(fresh_allowed)
        self.assertEqual(info["remaining"], 4)

    def test_concurrent_access_thread_safety(self):
        """
        Verify thread-safety when 20 concurrent threads attempt requests simultaneously.
        """
        concurrency_limiter = SlidingWindowRateLimiter(default_limit=10, default_window_seconds=60)
        results = []

        def worker():
            allowed, _ = concurrency_limiter.is_allowed(key="concurrent-svc", limit=10)
            results.append(allowed)

        threads = [threading.Thread(target=worker) for _ in range(20)]
        for t in threads:
            t.start()
        for t in threads:
            t.join()

        # Exactly 10 must succeed, and exactly 10 must be denied:
        allowed_count = sum(1 for r in results if r is True)
        denied_count = sum(1 for r in results if r is False)
        self.assertEqual(allowed_count, 10)
        self.assertEqual(denied_count, 10)
