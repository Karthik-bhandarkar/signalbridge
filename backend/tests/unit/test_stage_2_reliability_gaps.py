"""
===================================================================================
SignalBridge — Stage 2 Reliability & Outbound Notification Regression Tests
===================================================================================
PURPOSE:
    Validates Stage 2 engineering improvements:
      1. Notification dispatch wired to incident lifecycle transitions (OPEN, ESCALATED,
         ACKNOWLEDGED, RESOLVED, REOPENED).
      2. Duplicate notification suppression within sliding deduplication window.
      3. Fault-tolerant exception boundary: third-party provider failure does not
         abort or roll back incident transactions.
      4. Celery Beat periodic schedule configuration in Django settings.
===================================================================================
"""
import pytest
from unittest.mock import patch, MagicMock
import urllib.error

from django.conf import settings
from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient
from rest_framework import status

from apps.alerts.models import Incident, Alert
from apps.alerts.services import correlate_alert_and_incident
from apps.notifications.dispatch import (
    dispatch_incident_notification,
    safe_dispatch_incident_notification,
)
from apps.notifications.models import NotificationDestination, NotificationDelivery
from apps.webhooks.models import WebhookSource, IngestedPayload

User = get_user_model()


class Stage2ReliabilityTestCase(TestCase):
    """
    Tests notification lifecycle wiring, deduplication, and fault tolerance.
    """

    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user(username="sre-operator", password="password123", is_staff=True)
        self.client.force_authenticate(user=self.user)

        # Create active console destination:
        self.console_dest = NotificationDestination.objects.create(
            name="SRE Operations Console",
            destination_type=NotificationDestination.DestinationType.CONSOLE,
            is_active=True,
        )

        # Create active webhook destination:
        self.webhook_dest = NotificationDestination.objects.create(
            name="PagerDuty Webhook Adapter",
            destination_type=NotificationDestination.DestinationType.WEBHOOK,
            endpoint_url="https://events.pagerduty.com/v2/enqueue",
            is_active=True,
        )

        self.source = WebhookSource.objects.create(
            name="Production Gateway",
            slug="prod-gw",
            secret_key="secret-key-123",
        )

    def test_celery_beat_schedule_is_configured(self):
        """
        Verifies that CELERY_BEAT_SCHEDULE contains periodic tasks for monitoring,
        pending webhook reconciliation, and stale task reclaim.
        """
        beat_schedule = getattr(settings, "CELERY_BEAT_SCHEDULE", {})
        assert "dispatch-scheduled-monitors-every-30s" in beat_schedule
        assert "reconcile-pending-webhooks-every-2m" in beat_schedule
        assert "reclaim-stale-processing-webhooks-every-5m" in beat_schedule

        assert beat_schedule["dispatch-scheduled-monitors-every-30s"]["task"] == "apps.monitoring.tasks.dispatch_scheduled_monitors"
        assert beat_schedule["reconcile-pending-webhooks-every-2m"]["task"] == "apps.webhooks.tasks.reconcile_pending_webhooks"
        assert beat_schedule["reclaim-stale-processing-webhooks-every-5m"]["task"] == "apps.webhooks.tasks.reclaim_stale_processing_webhooks"

    @patch("urllib.request.urlopen")
    def test_incident_opened_triggers_notification_dispatch(self, mock_urlopen):
        """
        When a new incident is created, an INCIDENT_OPENED notification is dispatched
        and recorded in NotificationDelivery.
        """
        mock_resp = MagicMock()
        mock_resp.getcode.return_value = 202
        mock_urlopen.return_value.__enter__.return_value = mock_resp

        alert_data = {
            "service": "checkout-api",
            "fingerprint": "db-pool-exhausted",
            "title": "Database connection pool exhausted",
            "severity": "HIGH",
        }

        with self.captureOnCommitCallbacks(execute=True):
            alert, incident, is_new, is_dup = correlate_alert_and_incident(alert_data)

        assert is_new is True
        deliveries = NotificationDelivery.objects.filter(incident=incident, event_type="INCIDENT_OPENED")
        assert deliveries.count() >= 2  # Dispatched to both CONSOLE and WEBHOOK

    @patch("urllib.request.urlopen")
    def test_severity_escalation_triggers_notification_dispatch(self, mock_urlopen):
        """
        When a subsequent alert escalates incident severity, SEVERITY_ESCALATED
        notification is dispatched.
        """
        mock_resp = MagicMock()
        mock_resp.getcode.return_value = 200
        mock_urlopen.return_value.__enter__.return_value = mock_resp

        # 1. Initial MEDIUM incident:
        initial_data = {
            "service": "billing-service",
            "fingerprint": "latency-spike",
            "title": "High latency on billing",
            "severity": "MEDIUM",
        }
        with self.captureOnCommitCallbacks(execute=True):
            alert1, incident, _, _ = correlate_alert_and_incident(initial_data)

        # 2. Subsequent CRITICAL alert:
        critical_data = {
            "service": "billing-service",
            "fingerprint": "latency-spike",
            "title": "Billing completely down (504)",
            "severity": "CRITICAL",
        }
        with self.captureOnCommitCallbacks(execute=True):
            alert2, incident, is_new, is_dup = correlate_alert_and_incident(critical_data)

        assert is_new is False
        assert incident.severity == Incident.SeverityLevel.CRITICAL

        escalated_deliveries = NotificationDelivery.objects.filter(
            incident=incident,
            event_type="SEVERITY_ESCALATED",
        )
        assert escalated_deliveries.exists()

    @patch("urllib.request.urlopen")
    def test_operator_actions_trigger_notifications(self, mock_urlopen):
        """
        Verifies that operator actions (acknowledge, resolve, reopen) generate
        corresponding NotificationDelivery records.
        """
        mock_resp = MagicMock()
        mock_resp.getcode.return_value = 200
        mock_urlopen.return_value.__enter__.return_value = mock_resp

        incident = Incident.objects.create(
            service_name="auth-service",
            fingerprint="token-validation-error",
            severity=Incident.SeverityLevel.HIGH,
            status=Incident.IncidentStatus.OPEN,
        )

        # 1. Acknowledge:
        with self.captureOnCommitCallbacks(execute=True):
            ack_res = self.client.post(
                f"/api/v1/incidents/{incident.id}/acknowledge/",
                {"note": "Investigating auth pods"},
                format="json",
            )
        assert ack_res.status_code == status.HTTP_200_OK
        assert NotificationDelivery.objects.filter(incident=incident, event_type="ACKNOWLEDGED").exists()

        # 2. Resolve:
        with self.captureOnCommitCallbacks(execute=True):
            res_res = self.client.post(
                f"/api/v1/incidents/{incident.id}/resolve/",
                {"resolution_notes": "Rotated expired JWT signing keys"},
                format="json",
            )
        assert res_res.status_code == status.HTTP_200_OK
        assert NotificationDelivery.objects.filter(incident=incident, event_type="RESOLVED").exists()

        # 3. Reopen:
        with self.captureOnCommitCallbacks(execute=True):
            reopen_res = self.client.post(
                f"/api/v1/incidents/{incident.id}/reopen/",
                {"reason": "Errors re-spiked after cache expiration"},
                format="json",
            )
        assert reopen_res.status_code == status.HTTP_200_OK
        assert NotificationDelivery.objects.filter(incident=incident, event_type="REOPENED").exists()

    def test_duplicate_notification_suppression(self):
        """
        Calling dispatch_incident_notification twice in rapid succession suppresses
        duplicate delivery to prevent alert storms.
        """
        incident = Incident.objects.create(
            service_name="payment-gateway",
            fingerprint="stripe-timeout",
            severity=Incident.SeverityLevel.CRITICAL,
        )

        # First dispatch:
        deliveries_first = dispatch_incident_notification(incident, "INCIDENT_OPENED")
        console_deliv_1 = [d for d in deliveries_first if d.destination == self.console_dest]
        assert len(console_deliv_1) == 1

        # Second rapid dispatch for the same event:
        deliveries_second = dispatch_incident_notification(incident, "INCIDENT_OPENED")
        console_deliv_2 = [d for d in deliveries_second if d.destination == self.console_dest]
        # Should be suppressed due to dedup_window
        assert len(console_deliv_2) == 0

    @patch("urllib.request.urlopen")
    def test_provider_failure_does_not_abort_transaction(self, mock_urlopen):
        """
        When external webhook destination returns HTTP 500 or network error,
        safe_dispatch_incident_notification records FAILED delivery without crashing
        or rolling back the calling transaction.
        """
        mock_urlopen.side_effect = urllib.error.HTTPError(
            url="https://events.pagerduty.com/v2/enqueue",
            code=500,
            msg="Internal Server Error",
            hdrs={},
            fp=None,
        )

        incident = Incident.objects.create(
            service_name="shipping-service",
            fingerprint="carrier-api-failure",
            severity=Incident.SeverityLevel.HIGH,
        )

        # Should execute cleanly without raising:
        deliveries = safe_dispatch_incident_notification(incident, "INCIDENT_OPENED")
        webhook_deliv = [d for d in deliveries if d.destination == self.webhook_dest][0]

        assert webhook_deliv.status == NotificationDelivery.DeliveryStatus.FAILED
        assert webhook_deliv.response_status_code == 500
        assert "500" in webhook_deliv.error_message
