"""
===================================================================================
SignalBridge — Stage D Active Monitoring & Outbound Notifications Test Suite
===================================================================================
Verifies:
    1. Server-Side Request Forgery (SSRF) Protection:
       - Prohibits loopback (127.0.0.1, ::1)
       - Prohibits cloud instance metadata service (169.254.169.254)
       - Prohibits RFC 1918 private networks (10.0.0.0/8, 192.168.0.0/16, 172.16.0.0/12)
       - Rejects non-HTTP schemes (file://, gopher://, ftp://)
       - Permits safe public HTTP/HTTPS URLs
    2. Synthetic Monitor Probes & Threshold Crossing:
       - Records time-series probe latency and status code
       - Threshold breach automatically opens operational incident
       - Recovery resets consecutive failure counter
    3. Outbound Notification Dispatch:
       - Delivery to Console/Mock destination
       - Audit record logged in NotificationDelivery table
===================================================================================
"""
from unittest.mock import patch, MagicMock
import pytest
from rest_framework import status

from apps.alerts.models import Incident
from apps.monitoring.models import Monitor, MonitorCheckResult, Service
from apps.monitoring.ssrf import is_ip_blocked, validate_safe_url
from apps.monitoring.tasks import execute_monitor_check
from apps.notifications.dispatch import dispatch_incident_notification
from apps.notifications.models import NotificationDelivery, NotificationDestination


class TestSSRFProtection:
    """Tests for SSRF URL validation and IP inspection."""

    def test_prohibits_loopback_ips(self):
        is_safe, ip, err = validate_safe_url("http://127.0.0.1:8000/internal-admin")
        assert is_safe is False
        assert "loopback" in err.lower()

    def test_prohibits_cloud_metadata_service(self):
        is_safe, ip, err = validate_safe_url("http://169.254.169.254/latest/meta-data/")
        assert is_safe is False
        assert "cloud metadata" in err.lower() or "prohibited" in err.lower()

    def test_prohibits_private_rfc1918_ips_by_default(self):
        is_safe_10, _, _ = validate_safe_url("http://10.0.1.50/metrics", allow_private_ips=False)
        assert is_safe_10 is False

        is_safe_192, _, _ = validate_safe_url("http://192.168.1.1/router", allow_private_ips=False)
        assert is_safe_192 is False

        is_safe_172, _, _ = validate_safe_url("http://172.16.0.5/api", allow_private_ips=False)
        assert is_safe_172 is False

    def test_rejects_unsupported_schemes(self):
        is_safe, _, err = validate_safe_url("gopher://127.0.0.1:70/test")
        assert is_safe is False
        assert "scheme" in err.lower()

        is_safe_file, _, _ = validate_safe_url("file:///etc/passwd")
        assert is_safe_file is False

    def test_allows_valid_public_domain(self):
        is_safe, ip, err = validate_safe_url("https://example.com/healthz")
        assert is_safe is True
        assert err is None


@pytest.mark.django_db
class TestSyntheticMonitorExecution:
    """Tests for probe execution and automatic incident opening on threshold breach."""

    def test_monitor_failure_threshold_opens_incident(self):
        service = Service.objects.create(name="Billing Engine", slug="billing-engine", tier="TIER_0")
        monitor = Monitor.objects.create(
            service=service,
            name="Checkout Payment Gateway Probe",
            target_url="http://192.168.1.99/healthz",
            failure_threshold=2,
            timeout_seconds=2,
        )

        # Mock probe failure (e.g. connection refused)
        with patch("urllib.request.urlopen") as mock_urlopen:
            mock_urlopen.side_effect = Exception("Connection Refused")

            # 1. First probe failure (1/2 threshold) -> does NOT open incident yet:
            res1 = execute_monitor_check(str(monitor.id))
            assert res1["status"] == Monitor.HealthStatus.DOWN
            monitor.refresh_from_db()
            assert monitor.consecutive_failures == 1
            assert Incident.objects.filter(service_name="billing-engine").count() == 0

            # 2. Second probe failure (2/2 threshold) -> BREACH! Opens Incident:
            res2 = execute_monitor_check(str(monitor.id))
            assert res2["status"] == Monitor.HealthStatus.DOWN
            monitor.refresh_from_db()
            assert monitor.consecutive_failures == 2

            incidents = Incident.objects.filter(service_name="billing-engine")
            assert incidents.count() == 1
            inc = incidents.first()
            assert inc.status == Incident.IncidentStatus.OPEN
            assert inc.severity == Incident.SeverityLevel.CRITICAL
            assert "DOWN" in inc.alerts.first().title or "Synthetic Monitor Outage" in inc.alerts.first().title

    def test_monitor_recovery_resets_consecutive_failures(self):
        service = Service.objects.create(name="Search API", slug="search-api")
        monitor = Monitor.objects.create(
            service=service,
            name="Search Cluster Health",
            target_url="https://example.com/healthz",
            consecutive_failures=3,
            current_status=Monitor.HealthStatus.DOWN,
        )

        # Mock successful 200 OK response:
        mock_response = MagicMock()
        mock_response.getcode.return_value = 200
        mock_response.__enter__.return_value = mock_response

        with patch("urllib.request.urlopen", return_value=mock_response):
            res = execute_monitor_check(str(monitor.id))
            assert res["status"] == Monitor.HealthStatus.UP
            monitor.refresh_from_db()
            assert monitor.consecutive_failures == 0
            assert monitor.current_status == Monitor.HealthStatus.UP


@pytest.mark.django_db
class TestOutboundNotifications:
    """Tests for outbound notification destinations and dispatching."""

    def test_dispatch_incident_notification_records_delivery(self):
        inc = Incident.objects.create(
            service_name="auth-service",
            fingerprint="token-expiry-spike",
            status=Incident.IncidentStatus.OPEN,
            severity=Incident.SeverityLevel.HIGH,
        )
        dest = NotificationDestination.objects.create(
            name="DevOps Console",
            destination_type=NotificationDestination.DestinationType.CONSOLE,
            is_active=True,
        )

        deliveries = dispatch_incident_notification(
            incident=inc,
            event_type="INCIDENT_OPENED",
            details={"trigger": "synthetic_monitor"},
        )

        assert len(deliveries) == 1
        d = deliveries[0]
        assert d.status == NotificationDelivery.DeliveryStatus.DELIVERED
        assert d.destination == dest
        assert d.event_type == "INCIDENT_OPENED"
        assert d.payload_snapshot["service_name"] == "auth-service"
        assert NotificationDelivery.objects.filter(incident=inc).count() == 1
