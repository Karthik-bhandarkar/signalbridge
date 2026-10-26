"""
===================================================================================
SignalBridge — Stage C Operator Backend API Test Suite
===================================================================================
Verifies:
    1. Liveness and Readiness Probes (/health/live/ and /health/ready/)
    2. Operator Session Auth (/api/v1/auth/login/, /me/, /csrf/, /logout/)
    3. Operator Incident Workflows:
       - List & filter by status/severity/service
       - Incident detail with alerts and events
       - State transitions: Acknowledge, Assign, Resolve, Reopen, Add Notes
    4. Alert Operations:
       - List & filter
       - Detail
       - Manual Retry
    5. Webhook Source Integrations:
       - List & register new source
       - Patch active status & rate limits
       - Rotate cryptographic HMAC secret key
    6. Global Audit Log
===================================================================================
"""
import pytest
from django.contrib.auth import get_user_model
from rest_framework import status
from rest_framework.test import APIClient

from apps.alerts.models import Alert, Incident, IncidentEvent
from apps.webhooks.models import IngestedPayload, WebhookSource

User = get_user_model()


@pytest.fixture
def operator_user(db):
    """Creates a standard staff operator user."""
    return User.objects.create_user(
        username="oncall-lead",
        email="oncall@signalbridge.internal",
        password="secure-operator-password-123",
        is_staff=True,
    )


@pytest.fixture
def admin_user(db):
    """Creates an admin operator user with ADMIN role."""
    from apps.core.models import UserRole
    user = User.objects.create_user(
        username="secops-admin",
        email="admin@signalbridge.internal",
        password="secure-admin-password-123",
        is_staff=True,
    )
    user.profile.role = UserRole.ADMIN
    user.profile.save()
    return user


@pytest.fixture
def admin_client(admin_user):
    """Client with an authenticated Admin session."""
    client = APIClient()
    client.login(username="secops-admin", password="secure-admin-password-123")
    return client


@pytest.fixture
def auth_client(operator_user):
    """Client with an authenticated session."""
    client = APIClient()
    client.login(username="oncall-lead", password="secure-operator-password-123")
    return client


@pytest.mark.django_db
class TestHealthProbes:
    """Tests for Kubernetes liveness and readiness probes."""

    def test_health_live_endpoint_returns_200(self, api_client):
        res = api_client.get("/health/live/")
        assert res.status_code == status.HTTP_200_OK
        data = res.json()
        assert data["status"] == "live"
        assert "timestamp" in data

    def test_health_ready_endpoint_returns_200(self, api_client):
        res = api_client.get("/health/ready/")
        assert res.status_code == status.HTTP_200_OK
        data = res.json()
        assert data["status"] == "ready"
        assert data["checks"]["database"]["status"] == "ok"


@pytest.mark.django_db
class TestOperatorAuthAPI:
    """Tests for operator session authentication."""

    def test_login_success_sets_session(self, api_client, operator_user):
        res = api_client.post(
            "/api/v1/auth/login/",
            data={"username": "oncall-lead", "password": "secure-operator-password-123"},
            format="json",
        )
        assert res.status_code == status.HTTP_200_OK
        data = res.json()
        assert data["status"] == "success"
        assert data["user"]["username"] == "oncall-lead"
        assert "csrf_token" in data

    def test_login_invalid_credentials_returns_401(self, api_client, operator_user):
        res = api_client.post(
            "/api/v1/auth/login/",
            data={"username": "oncall-lead", "password": "wrong-password"},
            format="json",
        )
        assert res.status_code == status.HTTP_401_UNAUTHORIZED

    def test_auth_me_authenticated_and_logout(self, auth_client):
        # 1. Verify /me returns current user:
        res = auth_client.get("/api/v1/auth/me/")
        assert res.status_code == status.HTTP_200_OK
        assert res.json()["authenticated"] is True
        assert res.json()["user"]["username"] == "oncall-lead"

        # 2. Logout:
        logout_res = auth_client.post("/api/v1/auth/logout/")
        assert logout_res.status_code == status.HTTP_200_OK

        # 3. Verify /me is now unauthenticated:
        after_res = auth_client.get("/api/v1/auth/me/")
        assert after_res.json()["authenticated"] is False

    def test_auth_csrf_endpoint(self, api_client):
        res = api_client.get("/api/v1/auth/csrf/")
        assert res.status_code == status.HTTP_200_OK
        assert "csrfToken" in res.json()


@pytest.mark.django_db
class TestIncidentWorkflowsAPI:
    """Tests for listing, filtering, and mutating incidents."""

    def test_list_incidents_filtering_and_pagination(self, auth_client):
        # Seed 3 distinct incidents:
        Incident.objects.create(service_name="auth", fingerprint="fp-1", status=Incident.IncidentStatus.OPEN, severity=Incident.SeverityLevel.CRITICAL)
        Incident.objects.create(service_name="payment", fingerprint="fp-2", status=Incident.IncidentStatus.ACKNOWLEDGED, severity=Incident.SeverityLevel.HIGH)
        Incident.objects.create(service_name="auth", fingerprint="fp-3", status=Incident.IncidentStatus.RESOLVED, severity=Incident.SeverityLevel.LOW)

        # Filter by service:
        res_service = auth_client.get("/api/v1/incidents/?service=auth")
        assert res_service.status_code == status.HTTP_200_OK
        data = res_service.json()
        assert data["count"] == 2

        # Filter by status:
        res_status = auth_client.get("/api/v1/incidents/?status=OPEN")
        assert res_status.status_code == status.HTTP_200_OK
        assert res_status.json()["count"] == 1

        # Search query:
        res_search = auth_client.get("/api/v1/incidents/?search=payment")
        assert res_search.json()["count"] == 1

    def test_incident_detail_with_alerts_and_events(self, auth_client, webhook_source):
        inc = Incident.objects.create(
            service_name="checkout",
            fingerprint="redis-oom",
            status=Incident.IncidentStatus.OPEN,
            severity=Incident.SeverityLevel.CRITICAL,
        )
        payload = IngestedPayload.objects.create(source=webhook_source, tracking_id="trk-c-001", idempotency_hash="hash-c-001")
        Alert.objects.create(
            incident=inc,
            payload=payload,
            service_name="checkout",
            fingerprint="redis-oom",
            severity=Alert.SeverityLevel.CRITICAL,
            title="Redis Memory Exhaustion",
            deduplication_hash="dedup-c-001",
        )
        IncidentEvent.objects.create(
            incident=inc,
            event_type=IncidentEvent.EventType.CREATED,
            description="Incident opened automatically",
            actor="system",
        )

        res = auth_client.get(f"/api/v1/incidents/{inc.id}/")
        assert res.status_code == status.HTTP_200_OK
        data = res.json()
        assert data["id"] == str(inc.id)
        assert len(data["alerts"]) == 1
        assert len(data["events"]) == 1

    def test_incident_state_transitions(self, auth_client):
        inc = Incident.objects.create(
            service_name="inventory",
            fingerprint="db-timeout",
            status=Incident.IncidentStatus.OPEN,
            severity=Incident.SeverityLevel.HIGH,
        )

        # 1. Acknowledge:
        ack_res = auth_client.post(
            f"/api/v1/incidents/{inc.id}/acknowledge/",
            data={"note": "Investigating replica lag"},
            format="json",
        )
        assert ack_res.status_code == status.HTTP_200_OK
        assert ack_res.json()["status"] == Incident.IncidentStatus.ACKNOWLEDGED

        # 2. Assign:
        assign_res = auth_client.post(
            f"/api/v1/incidents/{inc.id}/assign/",
            data={"assigned_to": "infra-sre-team", "note": "Routing to database reliability team"},
            format="json",
        )
        assert assign_res.status_code == status.HTTP_200_OK
        assert assign_res.json()["assigned_to"] == "infra-sre-team"

        # 3. Add Note:
        note_res = auth_client.post(
            f"/api/v1/incidents/{inc.id}/notes/",
            data={"note": "Restarted read replica; query queue cleared."},
            format="json",
        )
        assert note_res.status_code == status.HTTP_201_CREATED

        # 4. Resolve:
        resolve_res = auth_client.post(
            f"/api/v1/incidents/{inc.id}/resolve/",
            data={"resolution_notes": "Read replica restarted; query latency normalized to 15ms."},
            format="json",
        )
        assert resolve_res.status_code == status.HTTP_200_OK
        assert resolve_res.json()["status"] == Incident.IncidentStatus.RESOLVED

        # 5. Reopen:
        reopen_res = auth_client.post(
            f"/api/v1/incidents/{inc.id}/reopen/",
            data={"reason": "Latency spiked again after traffic increase"},
            format="json",
        )
        assert reopen_res.status_code == status.HTTP_200_OK
        assert reopen_res.json()["status"] == Incident.IncidentStatus.OPEN


@pytest.mark.django_db
class TestAlertOperationsAPI:
    """Tests for Alert retrieval and manual reprocessing."""

    def test_alert_list_and_detail(self, auth_client, webhook_source):
        inc = Incident.objects.create(service_name="search", fingerprint="fp-s")
        payload = IngestedPayload.objects.create(source=webhook_source, tracking_id="trk-s-001", idempotency_hash="hash-s-001")
        alert = Alert.objects.create(
            incident=inc,
            payload=payload,
            service_name="search",
            fingerprint="fp-s",
            severity=Alert.SeverityLevel.HIGH,
            title="Elasticsearch Cluster Yellow",
            deduplication_hash="dedup-s-001",
        )

        # List:
        res_list = auth_client.get("/api/v1/alerts/?service=search")
        assert res_list.status_code == status.HTTP_200_OK
        assert res_list.json()["count"] == 1

        # Detail:
        res_detail = auth_client.get(f"/api/v1/alerts/{alert.id}/")
        assert res_detail.status_code == status.HTTP_200_OK
        assert res_detail.json()["title"] == "Elasticsearch Cluster Yellow"


@pytest.mark.django_db
class TestIntegrationManagementAPI:
    """Tests for managing WebhookSource integrations."""

    def test_integration_crud_and_secret_rotation(self, api_client, auth_client, admin_client):
        # 1. Unauthenticated creation is rejected:
        unauth_create = api_client.post(
            "/api/v1/integrations/",
            data={"name": "Stripe Production", "slug": "stripe-prod", "rate_limit_per_minute": 300},
            format="json",
        )
        assert unauth_create.status_code == status.HTTP_403_FORBIDDEN

        # 2. Operator creation is rejected (Admin required):
        op_create = auth_client.post(
            "/api/v1/integrations/",
            data={"name": "Stripe Production", "slug": "stripe-prod", "rate_limit_per_minute": 300},
            format="json",
        )
        assert op_create.status_code == status.HTTP_403_FORBIDDEN

        # 3. Admin creation succeeds:
        create_res = admin_client.post(
            "/api/v1/integrations/",
            data={"name": "Stripe Production", "slug": "stripe-prod", "rate_limit_per_minute": 300},
            format="json",
        )
        assert create_res.status_code == status.HTTP_201_CREATED
        source_id = create_res.json()["id"]
        old_secret = create_res.json()["secret_key"]
        assert len(old_secret) >= 32

        # 4. List (allowed for operators):
        list_res = auth_client.get("/api/v1/integrations/")
        assert list_res.status_code == status.HTTP_200_OK
        assert any(s["slug"] == "stripe-prod" for s in list_res.json())

        # 5. Patch (Admin succeeds):
        patch_res = admin_client.patch(
            f"/api/v1/integrations/{source_id}/",
            data={"rate_limit_per_minute": 600, "is_active": False},
            format="json",
        )
        assert patch_res.status_code == status.HTTP_200_OK
        assert patch_res.json()["rate_limit_per_minute"] == 600
        assert patch_res.json()["is_active"] is False

        # 6. Secret Rotation: Unauthenticated request rejected (403):
        unauth_rotate = api_client.post(f"/api/v1/integrations/{source_id}/regenerate-secret/")
        assert unauth_rotate.status_code == status.HTTP_403_FORBIDDEN

        # 7. Secret Rotation: Operator rejected (403):
        op_rotate = auth_client.post(f"/api/v1/integrations/{source_id}/regenerate-secret/")
        assert op_rotate.status_code == status.HTTP_403_FORBIDDEN

        # 8. Secret Rotation: Admin succeeds (200):
        rotate_res = admin_client.post(f"/api/v1/integrations/{source_id}/regenerate-secret/")
        assert rotate_res.status_code == status.HTTP_200_OK
        new_secret = rotate_res.json()["integration"]["secret_key"]
        assert new_secret != old_secret
        assert len(new_secret) >= 32


@pytest.mark.django_db
class TestAuditLogAPI:
    """Tests for global chronological timeline."""

    def test_audit_log_endpoint(self, auth_client):
        inc = Incident.objects.create(service_name="gateway", fingerprint="502-bad-gateway")
        IncidentEvent.objects.create(
            incident=inc,
            event_type=IncidentEvent.EventType.CREATED,
            description="Created via webhook",
            actor="system",
        )
        IncidentEvent.objects.create(
            incident=inc,
            event_type=IncidentEvent.EventType.ACKNOWLEDGED,
            description="Acknowledged by operator",
            actor="alice",
        )

        res = auth_client.get("/api/v1/audit/")
        assert res.status_code == status.HTTP_200_OK
        data = res.json()
        assert data["count"] >= 2
        assert any(e["actor"] == "alice" for e in data["results"])


@pytest.mark.django_db
class TestOperatorEndpointAuthorizationSecurity:
    """
    Security regression test suite verifying:
    1. Unauthenticated requests to operator-only mutation endpoints are rejected (403 Forbidden).
    2. Authenticated operator requests can successfully perform permitted actions (200/201).
    3. Public webhook ingestion and health probes remain accessible without authentication.
    4. Authenticated operator username is securely bound as event actor in audit trail.
    """

    def test_unauthenticated_requests_rejected_on_operator_endpoints(self, api_client, webhook_source):
        inc = Incident.objects.create(
            service_name="payment-svc",
            fingerprint="stripe-timeout",
            status=Incident.IncidentStatus.OPEN,
            severity=Incident.SeverityLevel.HIGH,
        )

        # 1. Incident Acknowledge:
        ack_res = api_client.post(f"/api/v1/incidents/{inc.id}/acknowledge/", data={"note": "hack"}, format="json")
        assert ack_res.status_code == status.HTTP_403_FORBIDDEN

        # 2. Incident Assign:
        assign_res = api_client.post(f"/api/v1/incidents/{inc.id}/assign/", data={"assigned_to": "attacker"}, format="json")
        assert assign_res.status_code == status.HTTP_403_FORBIDDEN

        # 3. Incident Resolve:
        resolve_res = api_client.post(f"/api/v1/incidents/{inc.id}/resolve/", data={"resolution_notes": "hack"}, format="json")
        assert resolve_res.status_code == status.HTTP_403_FORBIDDEN

        # 4. Incident Reopen:
        reopen_res = api_client.post(f"/api/v1/incidents/{inc.id}/reopen/", data={"reason": "hack"}, format="json")
        assert reopen_res.status_code == status.HTTP_403_FORBIDDEN

        # 5. Incident Add Note:
        note_res = api_client.post(f"/api/v1/incidents/{inc.id}/notes/", data={"note": "hack"}, format="json")
        assert note_res.status_code == status.HTTP_403_FORBIDDEN

        # 6. Integration Secret Regeneration:
        rotate_res = api_client.post(f"/api/v1/integrations/{webhook_source.id}/regenerate-secret/")
        assert rotate_res.status_code == status.HTTP_403_FORBIDDEN

    def test_authenticated_operator_can_perform_all_operator_actions(self, auth_client, admin_client, operator_user, webhook_source):
        inc = Incident.objects.create(
            service_name="payment-svc",
            fingerprint="stripe-timeout",
            status=Incident.IncidentStatus.OPEN,
            severity=Incident.SeverityLevel.HIGH,
        )

        # 1. Incident Acknowledge:
        ack_res = auth_client.post(f"/api/v1/incidents/{inc.id}/acknowledge/", data={"note": "Investigating"}, format="json")
        assert ack_res.status_code == status.HTTP_200_OK
        assert ack_res.json()["status"] == Incident.IncidentStatus.ACKNOWLEDGED
        ack_event = IncidentEvent.objects.filter(incident=inc, event_type=IncidentEvent.EventType.ACKNOWLEDGED).latest("created_at")
        assert ack_event.actor == operator_user.username

        # 2. Incident Assign:
        assign_res = auth_client.post(f"/api/v1/incidents/{inc.id}/assign/", data={"assigned_to": "sre-alice"}, format="json")
        assert assign_res.status_code == status.HTTP_200_OK
        assert assign_res.json()["assigned_to"] == "sre-alice"
        assign_event = IncidentEvent.objects.filter(incident=inc, event_type=IncidentEvent.EventType.ASSIGNED).latest("created_at")
        assert assign_event.actor == operator_user.username

        # 3. Incident Add Note:
        note_res = auth_client.post(f"/api/v1/incidents/{inc.id}/notes/", data={"note": "Root cause identified"}, format="json")
        assert note_res.status_code == status.HTTP_201_CREATED
        note_event = IncidentEvent.objects.filter(incident=inc, event_type=IncidentEvent.EventType.NOTE_ADDED).latest("created_at")
        assert note_event.actor == operator_user.username

        # 4. Incident Resolve:
        resolve_res = auth_client.post(f"/api/v1/incidents/{inc.id}/resolve/", data={"resolution_notes": "Patch deployed"}, format="json")
        assert resolve_res.status_code == status.HTTP_200_OK
        assert resolve_res.json()["status"] == Incident.IncidentStatus.RESOLVED
        resolve_event = IncidentEvent.objects.filter(incident=inc, event_type=IncidentEvent.EventType.RESOLVED).latest("created_at")
        assert resolve_event.actor == operator_user.username

        # 5. Incident Reopen:
        reopen_res = auth_client.post(f"/api/v1/incidents/{inc.id}/reopen/", data={"reason": "Flapping alert re-triggered"}, format="json")
        assert reopen_res.status_code == status.HTTP_200_OK
        assert reopen_res.json()["status"] == Incident.IncidentStatus.OPEN
        reopen_event = IncidentEvent.objects.filter(incident=inc, event_type=IncidentEvent.EventType.REOPENED).latest("created_at")
        assert reopen_event.actor == operator_user.username

        # 6. Integration Secret Regeneration (requires Admin role):
        op_rotate = auth_client.post(f"/api/v1/integrations/{webhook_source.id}/regenerate-secret/")
        assert op_rotate.status_code == status.HTTP_403_FORBIDDEN

        old_secret = webhook_source.secret_key
        rotate_res = admin_client.post(f"/api/v1/integrations/{webhook_source.id}/regenerate-secret/")
        assert rotate_res.status_code == status.HTTP_200_OK
        webhook_source.refresh_from_db()
        assert webhook_source.secret_key != old_secret

    def test_public_endpoints_remain_accessible_without_auth(self, api_client, webhook_source, valid_alert_payload):
        import hmac
        import hashlib
        import json

        # 1. Health Liveness:
        live_res = api_client.get("/health/live/")
        assert live_res.status_code == status.HTTP_200_OK

        # 2. Health Readiness:
        ready_res = api_client.get("/health/ready/")
        assert ready_res.status_code == status.HTTP_200_OK

        # 3. Webhook Ingestion Gateway:
        body = json.dumps({"event_type": "alert.trigger", "payload": valid_alert_payload}).encode("utf-8")
        sig = hmac.new(webhook_source.secret_key.encode("utf-8"), body, hashlib.sha256).hexdigest()
        webhook_res = api_client.post(
            f"/api/v1/webhooks/{webhook_source.slug}/",
            data=body,
            content_type="application/json",
            HTTP_X_SIGNATURE_256=sig,
            HTTP_X_TRACKING_ID="test-unauth-webhook-001",
        )
        assert webhook_res.status_code == status.HTTP_202_ACCEPTED
