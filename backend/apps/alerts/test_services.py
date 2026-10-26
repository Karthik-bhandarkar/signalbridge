"""
===================================================================================
SignalBridge Webhook Ingestion Engine — Alert Service & Deduplication Unit Tests
===================================================================================
"""
from django.test import TestCase

from apps.alerts.deduplication import calculate_alert_dedup_hash, is_alert_duplicate
from apps.alerts.models import Alert, Incident, IncidentEvent
from apps.alerts.services import correlate_alert_and_incident, normalize_severity
from apps.webhooks.models import IngestedPayload, WebhookSource


class AlertDeduplicationTestCase(TestCase):
    """Unit tests for deterministic alert hashing and deduplication checking."""

    def test_calculate_alert_dedup_hash_deterministic(self):
        """Validates that hashing identical normalized inputs produces identical digests."""
        hash1 = calculate_alert_dedup_hash("billing-api", "db-timeout", "Pool Exhausted")
        hash2 = calculate_alert_dedup_hash("BILLING-API ", " DB-TIMEOUT", "pool exhausted ")
        self.assertEqual(hash1, hash2)
        self.assertEqual(len(hash1), 64)

    def test_calculate_alert_dedup_hash_distinct_inputs(self):
        """Validates that different titles yield different deduplication digests."""
        hash1 = calculate_alert_dedup_hash("billing-api", "db-timeout", "Pool Exhausted")
        hash2 = calculate_alert_dedup_hash("billing-api", "db-timeout", "Disk Full")
        self.assertNotEqual(hash1, hash2)

    def test_normalize_severity_mapping(self):
        """Validates normalization from vendor severity formats to standard tiers."""
        self.assertEqual(normalize_severity("CRITICAL"), Incident.SeverityLevel.CRITICAL)
        self.assertEqual(normalize_severity("P1"), Incident.SeverityLevel.CRITICAL)
        self.assertEqual(normalize_severity("error"), Incident.SeverityLevel.HIGH)
        self.assertEqual(normalize_severity("WARNING"), Incident.SeverityLevel.MEDIUM)
        self.assertEqual(normalize_severity("info"), Incident.SeverityLevel.LOW)
        self.assertEqual(normalize_severity(None), Incident.SeverityLevel.MEDIUM)


class AlertIncidentGroupingTestCase(TestCase):
    """Integration tests for alert correlation, incident creation, and severity escalation."""

    def setUp(self):
        self.source = WebhookSource.objects.create(
            name="PagerDuty Production",
            slug="pagerduty-prod",
            secret_key="secret-key-123",
        )
        self.payload = IngestedPayload.objects.create(
            source=self.source,
            tracking_id="trk-1001",
            idempotency_hash="hash-abc-123",
            status=IngestedPayload.ProcessingStatus.PENDING,
        )

    def test_first_alert_creates_incident(self):
        """Initial alert creates a fresh Incident in OPEN status with alert_count=1."""
        alert_data = {
            "service": "checkout-service",
            "fingerprint": "db-conn-pool-exhausted",
            "severity": "HIGH",
            "title": "Database connection pool exhausted",
            "description": "500 errors surging",
        }
        alert, incident, is_new, is_dup = correlate_alert_and_incident(
            alert_data=alert_data,
            payload=self.payload,
        )

        self.assertTrue(is_new)
        self.assertFalse(is_dup)
        self.assertEqual(incident.service_name, "checkout-service")
        self.assertEqual(incident.fingerprint, "db-conn-pool-exhausted")
        self.assertEqual(incident.status, Incident.IncidentStatus.OPEN)
        self.assertEqual(incident.severity, Incident.SeverityLevel.HIGH)
        self.assertEqual(incident.alert_count, 1)

        # Audit event created:
        events = IncidentEvent.objects.filter(incident=incident)
        self.assertEqual(events.count(), 1)
        self.assertEqual(events.first().event_type, IncidentEvent.EventType.CREATED)

    def test_correlated_alert_attaches_to_existing_incident(self):
        """Subsequent alert with matching service & fingerprint attaches to the open Incident."""
        base_data = {
            "service": "auth-service",
            "fingerprint": "jwt-verification-failure",
            "severity": "MEDIUM",
            "title": "JWT Signature Verification Failed",
        }
        # First alert:
        alert1, inc1, is_new1, _ = correlate_alert_and_incident(base_data, self.payload)
        self.assertTrue(is_new1)
        self.assertEqual(inc1.alert_count, 1)

        # Second alert (different title so not alert duplicate, but same service & fingerprint):
        data2 = {
            "service": "auth-service",
            "fingerprint": "jwt-verification-failure",
            "severity": "MEDIUM",
            "title": "JWT Expired Token Spike",
        }
        alert2, inc2, is_new2, _ = correlate_alert_and_incident(data2, self.payload)
        self.assertFalse(is_new2)
        self.assertEqual(inc1.id, inc2.id)

        inc2.refresh_from_db()
        self.assertEqual(inc2.alert_count, 2)
        self.assertEqual(inc2.alerts.count(), 2)

    def test_automatic_severity_escalation(self):
        """When an incoming alert has higher severity, the parent incident escalates."""
        initial_data = {
            "service": "search-service",
            "fingerprint": "slow-query",
            "severity": "LOW",
            "title": "Query latency p95 > 200ms",
        }
        alert1, incident, _, _ = correlate_alert_and_incident(initial_data, self.payload)
        self.assertEqual(incident.severity, Incident.SeverityLevel.LOW)

        # Escalate with CRITICAL alert:
        critical_data = {
            "service": "search-service",
            "fingerprint": "slow-query",
            "severity": "CRITICAL",
            "title": "Elasticsearch cluster unreachable",
        }
        alert2, incident, _, _ = correlate_alert_and_incident(critical_data, self.payload)
        incident.refresh_from_db()

        self.assertEqual(incident.severity, Incident.SeverityLevel.CRITICAL)
        self.assertEqual(incident.alert_count, 2)

        # Verify escalation event logged in audit table:
        escalation_event = IncidentEvent.objects.filter(
            incident=incident,
            event_type=IncidentEvent.EventType.SEVERITY_ESCALATED,
        ).first()
        self.assertIsNotNone(escalation_event)
        self.assertIn("escalated from LOW to CRITICAL", escalation_event.description)
