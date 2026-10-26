"""
===================================================================================
SignalBridge — DSA Module 1: Idempotency Unit Tests
===================================================================================
Tests for:
    1. Deterministic SHA-256 fingerprint generation (ordering independence).
    2. Redis/in-memory IdempotencyManager check_and_set atomic locking.
    3. Duplicate detection within TTL window.
    4. Key release and TTL inspection.
===================================================================================
"""
import time
from django.test import SimpleTestCase
from apps.core.dsa.idempotency import IdempotencyManager, generate_payload_fingerprint


class IdempotencyDSATestCase(SimpleTestCase):
    """
    Unit tests for the Idempotency DSA module.
    """

    def setUp(self):
        self.manager = IdempotencyManager(default_ttl=5)

    def test_deterministic_fingerprint_dict_key_ordering(self):
        """
        Verify that dictionary key insertion order does not alter the generated SHA-256 digest.
        """
        dict_a = {"service": "checkout", "severity": "HIGH", "cluster": "us-east-1"}
        dict_b = {"cluster": "us-east-1", "service": "checkout", "severity": "HIGH"}

        hash_a = generate_payload_fingerprint(dict_a)
        hash_b = generate_payload_fingerprint(dict_b)

        self.assertEqual(hash_a, hash_b)
        self.assertEqual(len(hash_a), 64)

    def test_deterministic_fingerprint_bytes(self):
        """
        Verify that identical raw bytes yield identical fingerprints.
        """
        raw_1 = b'{"event":"alert","id":123}'
        raw_2 = b'{"event":"alert","id":123}'

        hash_1 = generate_payload_fingerprint(raw_1)
        hash_2 = generate_payload_fingerprint(raw_2)

        self.assertEqual(hash_1, hash_2)

    def test_source_slug_namespacing(self):
        """
        Verify that different source slugs produce different hashes for identical payloads,
        preventing cross-source key collisions.
        """
        payload = b'{"ping": "pong"}'
        hash_pagerduty = generate_payload_fingerprint(payload, source_slug="pagerduty")
        hash_datadog = generate_payload_fingerprint(payload, source_slug="datadog")

        self.assertNotEqual(hash_pagerduty, hash_datadog)

    def test_idempotency_lock_acquisition_and_duplicate_detection(self):
        """
        Verify that the first call succeeds (fresh event), and the second call
        within TTL is recognized as a duplicate.
        """
        test_key = self.manager.build_key(source_slug="test-svc", fingerprint="abc123def456")
        metadata = {"tracking_id": "trc-9999", "attempt": 1}

        # First dispatch -> Fresh event (is_fresh == True)
        is_fresh, meta = self.manager.check_and_set(test_key, ttl_seconds=5, metadata=metadata)
        self.assertTrue(is_fresh)
        self.assertIsNone(meta)

        # Immediate duplicate dispatch -> Duplicate (is_fresh == False)
        is_dup_fresh, dup_meta = self.manager.check_and_set(test_key, ttl_seconds=5, metadata={"attempt": 2})
        self.assertFalse(is_dup_fresh)
        self.assertIsNotNone(dup_meta)
        self.assertEqual(dup_meta.get("tracking_id"), "trc-9999")

        # Clean up
        self.manager.release(test_key)

    def test_release_allows_immediate_reacquisition(self):
        """
        Verify that explicitly releasing a key allows immediate re-acquisition.
        """
        test_key = self.manager.build_key(source_slug="test-svc", fingerprint="unique-fp-888")

        is_fresh, _ = self.manager.check_and_set(test_key, ttl_seconds=10)
        self.assertTrue(is_fresh)

        # Release lock
        released = self.manager.release(test_key)
        self.assertTrue(released)

        # Immediate acquisition after release should succeed
        is_fresh_again, _ = self.manager.check_and_set(test_key, ttl_seconds=10)
        self.assertTrue(is_fresh_again)

        self.manager.release(test_key)
