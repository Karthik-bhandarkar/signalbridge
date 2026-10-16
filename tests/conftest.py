"""
===================================================================================
SignalBridge Webhook Ingestion Engine — Pytest Global Fixtures (conftest.py)
===================================================================================
PURPOSE:
    This module provides shared Pytest fixtures across unit, integration, and
    concurrency test suites.
===================================================================================
"""
import pytest
from rest_framework.test import APIClient

from apps.alerts.models import Alert, Incident
from apps.webhooks.models import IngestedPayload, WebhookSource


@pytest.fixture
def api_client():
    """Returns an unauthenticated Django REST Framework test client."""
    return APIClient()


@pytest.fixture
def webhook_source(db):
    """Creates a standard WebhookSource for testing."""
    return WebhookSource.objects.create(
        name="Production PagerDuty",
        slug="pagerduty",
        secret_key="test-secret-key-123",
        is_active=True,
        rate_limit_per_minute=120,
    )


@pytest.fixture
def inactive_webhook_source(db):
    """Creates a deactivated WebhookSource for negative authentication testing."""
    return WebhookSource.objects.create(
        name="Deactivated Datadog",
        slug="datadog-inactive",
        secret_key="inactive-secret-key",
        is_active=False,
    )


@pytest.fixture
def valid_alert_payload():
    """Provides a realistic vendor alert payload dictionary."""
    return {
        "service": "checkout-api",
        "fingerprint": "db-pool-exhausted",
        "severity": "CRITICAL",
        "title": "Database Connection Pool Exhausted",
        "description": "Surge in HTTP 500 errors across cluster-primary-01",
        "raw_metadata": {
            "cluster": "us-east-1",
            "active_connections": 105,
            "max_connections": 100,
        },
    }


@pytest.fixture
def sample_incident(db):
    """Creates an active open Incident record."""
    return Incident.objects.create(
        service_name="payment-gateway",
        fingerprint="stripe-timeout",
        status=Incident.IncidentStatus.OPEN,
        severity=Incident.SeverityLevel.HIGH,
        alert_count=1,
    )


@pytest.fixture
def sample_alert(db, sample_incident, webhook_source):
    """Creates an Alert attached to an Incident."""
    payload = IngestedPayload.objects.create(
        source=webhook_source,
        tracking_id="trk-conftest-01",
        idempotency_hash="hash-conftest-01",
        status=IngestedPayload.ProcessingStatus.PROCESSED,
    )
    return Alert.objects.create(
        payload=payload,
        incident=sample_incident,
        service_name="payment-gateway",
        fingerprint="stripe-timeout",
        severity=Alert.SeverityLevel.HIGH,
        title="Stripe 504 Gateway Timeout",
        deduplication_hash="dedup-hash-001",
    )
