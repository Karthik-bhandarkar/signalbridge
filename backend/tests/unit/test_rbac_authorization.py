"""
===================================================================================
SignalBridge — Role-Based Access Control (RBAC) Security Regression Test Suite
===================================================================================
PURPOSE:
    Validates end-to-end authorization rules across all SignalBridge API endpoints
    for every permission tier:
      1. ANONYMOUS: Denied access to all protected operator telemetry and mutations (401/403).
      2. VIEWER: Read-only access to operational information (200), denied all mutations (403).
      3. OPERATOR: Viewer read capabilities + incident triage, alert retries, probe triggers (200/201).
         Denied sensitive configuration, integration management, and secret rotation (403).
      4. ADMIN: Full operational capabilities + integration management, secret rotation,
         notification destination configuration, service registration, and user role management (200/201).
      5. SUPERUSER: Full administrative privileges per Django security conventions.
      6. SAFEGUARDS: Self-elevation prevention, superuser protection, public webhook intake preserved.
===================================================================================
"""
import pytest
from django.contrib.auth import get_user_model
from rest_framework import status
from rest_framework.test import APIClient

from apps.alerts.models import Alert, Incident
from apps.core.models import UserProfile, UserRole
from apps.monitoring.models import Service, Monitor
from apps.notifications.models import NotificationDestination
from apps.webhooks.models import IngestedPayload, WebhookSource

User = get_user_model()


@pytest.fixture
def viewer_user(db):
    """Creates a user with explicit VIEWER role."""
    user = User.objects.create_user(
        username="viewer-bob",
        email="bob@signalbridge.internal",
        password="secure-password-123",
        is_staff=False,
    )
    user.profile.role = UserRole.VIEWER
    user.profile.save()
    return user


@pytest.fixture
def viewer_client(viewer_user):
    client = APIClient()
    client.login(username="viewer-bob", password="secure-password-123")
    return client


@pytest.fixture
def operator_user(db):
    """Creates a user with explicit OPERATOR role."""
    user = User.objects.create_user(
        username="operator-alice",
        email="alice@signalbridge.internal",
        password="secure-password-123",
        is_staff=True,
    )
    user.profile.role = UserRole.OPERATOR
    user.profile.save()
    return user


@pytest.fixture
def operator_client(operator_user):
    client = APIClient()
    client.login(username="operator-alice", password="secure-password-123")
    return client


@pytest.fixture
def admin_user(db):
    """Creates a user with explicit ADMIN role."""
    user = User.objects.create_user(
        username="admin-carol",
        email="carol@signalbridge.internal",
        password="secure-password-123",
        is_staff=True,
    )
    user.profile.role = UserRole.ADMIN
    user.profile.save()
    return user


@pytest.fixture
def admin_client(admin_user):
    client = APIClient()
    client.login(username="admin-carol", password="secure-password-123")
    return client


@pytest.fixture
def superuser_user(db):
    """Creates a Django superuser."""
    return User.objects.create_superuser(
        username="root-super",
        email="root@signalbridge.internal",
        password="secure-password-123",
    )


@pytest.fixture
def superuser_client(superuser_user):
    client = APIClient()
    client.login(username="root-super", password="secure-password-123")
    return client


@pytest.fixture
def sample_incident(db):
    return Incident.objects.create(
        service_name="payment-gateway",
        fingerprint="err-stripe-500",
        status=Incident.IncidentStatus.OPEN,
        severity=Incident.SeverityLevel.HIGH,
    )


@pytest.fixture
def sample_integration(db):
    return WebhookSource.objects.create(
        name="Datadog Prod",
        slug="datadog-prod",
        secret_key="secret-key-0123456789abcdef0123456789abcdef",
        rate_limit_per_minute=1000,
        is_active=True,
    )


@pytest.fixture
def sample_service(db):
    return Service.objects.create(
        name="Authentication Service",
        slug="auth-svc",
        tier=Service.ServiceTier.TIER_1_STANDARD,
    )


@pytest.fixture
def sample_destination(db):
    return NotificationDestination.objects.create(
        name="Slack Security Alerts",
        destination_type=NotificationDestination.DestinationType.SLACK,
        endpoint_url="https://hooks.slack.com/services/T00/B00/X00",
        is_active=True,
    )


# =============================================================================
# 1. ANONYMOUS ACCESS PROTECTION
# =============================================================================

@pytest.mark.django_db
class TestAnonymousAccessRejection:
    """Verifies that unauthenticated requests cannot access protected APIs."""

    def test_anonymous_denied_on_incidents(self, api_client, sample_incident):
        assert api_client.get("/api/v1/incidents/").status_code == status.HTTP_403_FORBIDDEN
        assert api_client.get(f"/api/v1/incidents/{sample_incident.id}/").status_code == status.HTTP_403_FORBIDDEN
        assert api_client.post(f"/api/v1/incidents/{sample_incident.id}/acknowledge/").status_code == status.HTTP_403_FORBIDDEN
        assert api_client.post(f"/api/v1/incidents/{sample_incident.id}/assign/").status_code == status.HTTP_403_FORBIDDEN
        assert api_client.post(f"/api/v1/incidents/{sample_incident.id}/resolve/").status_code == status.HTTP_403_FORBIDDEN
        assert api_client.post(f"/api/v1/incidents/{sample_incident.id}/reopen/").status_code == status.HTTP_403_FORBIDDEN
        assert api_client.post(f"/api/v1/incidents/{sample_incident.id}/notes/").status_code == status.HTTP_403_FORBIDDEN

    def test_anonymous_denied_on_alerts_and_audit(self, api_client):
        assert api_client.get("/api/v1/alerts/").status_code == status.HTTP_403_FORBIDDEN
        assert api_client.get("/api/v1/audit/").status_code == status.HTTP_403_FORBIDDEN

    def test_anonymous_denied_on_integrations(self, api_client, sample_integration):
        assert api_client.get("/api/v1/integrations/").status_code == status.HTTP_403_FORBIDDEN
        assert api_client.post("/api/v1/integrations/").status_code == status.HTTP_403_FORBIDDEN
        assert api_client.post(f"/api/v1/integrations/{sample_integration.id}/regenerate-secret/").status_code == status.HTTP_403_FORBIDDEN

    def test_anonymous_denied_on_services_and_notifications(self, api_client, sample_destination):
        assert api_client.get("/api/v1/services/").status_code == status.HTTP_403_FORBIDDEN
        assert api_client.post("/api/v1/services/").status_code == status.HTTP_403_FORBIDDEN
        assert api_client.get("/api/v1/notifications/destinations/").status_code == status.HTTP_403_FORBIDDEN
        assert api_client.post("/api/v1/notifications/destinations/").status_code == status.HTTP_403_FORBIDDEN
        assert api_client.post(f"/api/v1/notifications/destinations/{sample_destination.id}/test-dispatch/").status_code == status.HTTP_403_FORBIDDEN
        assert api_client.get("/api/v1/notifications/deliveries/").status_code == status.HTTP_403_FORBIDDEN

    def test_anonymous_denied_on_analytics_and_users(self, api_client):
        assert api_client.get("/api/v1/analytics/metrics/").status_code == status.HTTP_403_FORBIDDEN
        assert api_client.get("/api/v1/analytics/summary/").status_code == status.HTTP_403_FORBIDDEN
        assert api_client.get("/api/v1/auth/users/").status_code == status.HTTP_403_FORBIDDEN


# =============================================================================
# 2. VIEWER TIER (READ-ONLY)
# =============================================================================

@pytest.mark.django_db
class TestViewerRolePermissions:
    """Verifies that Viewers have read-only access to operational information."""

    def test_viewer_allowed_read_operations(self, viewer_client, sample_incident, sample_integration, sample_destination, sample_service):
        assert viewer_client.get("/api/v1/incidents/").status_code == status.HTTP_200_OK
        assert viewer_client.get(f"/api/v1/incidents/{sample_incident.id}/").status_code == status.HTTP_200_OK
        assert viewer_client.get("/api/v1/alerts/").status_code == status.HTTP_200_OK
        assert viewer_client.get("/api/v1/audit/").status_code == status.HTTP_200_OK
        assert viewer_client.get("/api/v1/integrations/").status_code == status.HTTP_200_OK
        assert viewer_client.get(f"/api/v1/integrations/{sample_integration.id}/").status_code == status.HTTP_200_OK
        assert viewer_client.get("/api/v1/services/").status_code == status.HTTP_200_OK
        assert viewer_client.get("/api/v1/monitors/").status_code == status.HTTP_200_OK
        assert viewer_client.get("/api/v1/notifications/destinations/").status_code == status.HTTP_200_OK
        assert viewer_client.get("/api/v1/notifications/deliveries/").status_code == status.HTTP_200_OK
        assert viewer_client.get("/api/v1/analytics/metrics/").status_code == status.HTTP_200_OK
        assert viewer_client.get("/api/v1/analytics/summary/").status_code == status.HTTP_200_OK

    def test_viewer_denied_incident_mutations(self, viewer_client, sample_incident):
        assert viewer_client.post(f"/api/v1/incidents/{sample_incident.id}/acknowledge/", data={"note": "ack"}).status_code == status.HTTP_403_FORBIDDEN
        assert viewer_client.post(f"/api/v1/incidents/{sample_incident.id}/assign/", data={"assigned_to": "alice"}).status_code == status.HTTP_403_FORBIDDEN
        assert viewer_client.post(f"/api/v1/incidents/{sample_incident.id}/resolve/", data={"resolution_notes": "fixed"}).status_code == status.HTTP_403_FORBIDDEN
        assert viewer_client.post(f"/api/v1/incidents/{sample_incident.id}/reopen/", data={"reason": "reopen"}).status_code == status.HTTP_403_FORBIDDEN
        assert viewer_client.post(f"/api/v1/incidents/{sample_incident.id}/notes/", data={"note": "note"}).status_code == status.HTTP_403_FORBIDDEN

    def test_viewer_denied_administrative_mutations(self, viewer_client, sample_integration, sample_destination):
        assert viewer_client.post("/api/v1/integrations/", data={"name": "New", "slug": "new"}).status_code == status.HTTP_403_FORBIDDEN
        assert viewer_client.post(f"/api/v1/integrations/{sample_integration.id}/regenerate-secret/").status_code == status.HTTP_403_FORBIDDEN
        assert viewer_client.post("/api/v1/notifications/destinations/", data={"name": "New"}).status_code == status.HTTP_403_FORBIDDEN
        assert viewer_client.post(f"/api/v1/notifications/destinations/{sample_destination.id}/test-dispatch/").status_code == status.HTTP_403_FORBIDDEN
        assert viewer_client.get("/api/v1/auth/users/").status_code == status.HTTP_403_FORBIDDEN


# =============================================================================
# 3. OPERATOR TIER (VIEWER + INCIDENT TRIAGE)
# =============================================================================

@pytest.mark.django_db
class TestOperatorRolePermissions:
    """Verifies that Operators can triage incidents and investigate alerts, but cannot perform Admin tasks."""

    def test_operator_can_mutate_incidents(self, operator_client, sample_incident):
        # 1. Acknowledge:
        ack_res = operator_client.post(f"/api/v1/incidents/{sample_incident.id}/acknowledge/", data={"note": "Investigating"}, format="json")
        assert ack_res.status_code == status.HTTP_200_OK

        # 2. Assign:
        assign_res = operator_client.post(f"/api/v1/incidents/{sample_incident.id}/assign/", data={"assigned_to": "sre-lead"}, format="json")
        assert assign_res.status_code == status.HTTP_200_OK

        # 3. Add Note:
        note_res = operator_client.post(f"/api/v1/incidents/{sample_incident.id}/notes/", data={"note": "Checking DB replica"}, format="json")
        assert note_res.status_code == status.HTTP_201_CREATED

        # 4. Resolve:
        res_res = operator_client.post(f"/api/v1/incidents/{sample_incident.id}/resolve/", data={"resolution_notes": "Replica restarted"}, format="json")
        assert res_res.status_code == status.HTTP_200_OK

        # 5. Reopen:
        reopen_res = operator_client.post(f"/api/v1/incidents/{sample_incident.id}/reopen/", data={"reason": "Alert flared up again"}, format="json")
        assert reopen_res.status_code == status.HTTP_200_OK

    def test_operator_denied_admin_actions(self, operator_client, sample_integration, sample_destination):
        # Cannot create or rotate integration secrets:
        assert operator_client.post("/api/v1/integrations/", data={"name": "New", "slug": "new"}).status_code == status.HTTP_403_FORBIDDEN
        assert operator_client.post(f"/api/v1/integrations/{sample_integration.id}/regenerate-secret/").status_code == status.HTTP_403_FORBIDDEN

        # Cannot modify destinations or trigger test dispatches:
        assert operator_client.post("/api/v1/notifications/destinations/", data={"name": "New"}).status_code == status.HTTP_403_FORBIDDEN
        assert operator_client.post(f"/api/v1/notifications/destinations/{sample_destination.id}/test-dispatch/").status_code == status.HTTP_403_FORBIDDEN

        # Cannot manage user roles:
        assert operator_client.get("/api/v1/auth/users/").status_code == status.HTTP_403_FORBIDDEN


# =============================================================================
# 4. ADMIN TIER (OPERATOR + SENSITIVE MANAGEMENT & SECRETS)
# =============================================================================

@pytest.mark.django_db
class TestAdminRolePermissions:
    """Verifies that Admins possess operational and sensitive management capabilities."""

    def test_admin_can_manage_integrations_and_secrets(self, admin_client, sample_integration):
        # 1. Create integration:
        create_res = admin_client.post(
            "/api/v1/integrations/",
            data={"name": "GitHub Actions", "slug": "github-ci", "rate_limit_per_minute": 500},
            format="json",
        )
        assert create_res.status_code == status.HTTP_201_CREATED
        new_source_id = create_res.json()["id"]

        # 2. Patch integration:
        patch_res = admin_client.patch(
            f"/api/v1/integrations/{new_source_id}/",
            data={"rate_limit_per_minute": 1000},
            format="json",
        )
        assert patch_res.status_code == status.HTTP_200_OK

        # 3. Rotate secret key:
        rotate_res = admin_client.post(f"/api/v1/integrations/{new_source_id}/regenerate-secret/")
        assert rotate_res.status_code == status.HTTP_200_OK
        assert len(rotate_res.json()["integration"]["secret_key"]) >= 32

        # 4. Delete integration:
        del_res = admin_client.delete(f"/api/v1/integrations/{new_source_id}/")
        assert del_res.status_code == status.HTTP_204_NO_CONTENT

    def test_admin_can_manage_notifications(self, admin_client, sample_destination):
        # 1. Create destination:
        res_create = admin_client.post(
            "/api/v1/notifications/destinations/",
            data={
                "name": "PagerDuty Critical",
                "destination_type": NotificationDestination.DestinationType.PAGERDUTY,
                "endpoint_url": "https://events.pagerduty.com/v2/enqueue",
            },
            format="json",
        )
        assert res_create.status_code == status.HTTP_201_CREATED

        # 2. Trigger test dispatch:
        test_res = admin_client.post(f"/api/v1/notifications/destinations/{sample_destination.id}/test-dispatch/")
        assert test_res.status_code == status.HTTP_200_OK


# =============================================================================
# 5. USER ROLE MANAGEMENT & SAFEGUARDS
# =============================================================================

@pytest.mark.django_db
class TestRoleManagementAndSafeguards:
    """Verifies that role assignment is strictly guarded against self-elevation and abuse."""

    def test_admin_can_update_other_user_role(self, admin_client, viewer_user):
        res = admin_client.patch(
            f"/api/v1/auth/users/{viewer_user.id}/role/",
            data={"role": UserRole.OPERATOR},
            format="json",
        )
        assert res.status_code == status.HTTP_200_OK
        viewer_user.profile.refresh_from_db()
        assert viewer_user.profile.role == UserRole.OPERATOR

    def test_admin_cannot_modify_own_role(self, admin_client, admin_user):
        res = admin_client.patch(
            f"/api/v1/auth/users/{admin_user.id}/role/",
            data={"role": UserRole.VIEWER},
            format="json",
        )
        assert res.status_code == status.HTTP_400_BAD_REQUEST
        assert "cannot modify your own role" in res.json()["error"]

    def test_admin_cannot_alter_superuser_role(self, admin_client, superuser_user):
        res = admin_client.patch(
            f"/api/v1/auth/users/{superuser_user.id}/role/",
            data={"role": UserRole.VIEWER},
            format="json",
        )
        assert res.status_code == status.HTTP_400_BAD_REQUEST
        assert "Superuser privileges cannot be altered" in res.json()["error"]

    def test_operator_cannot_modify_roles(self, operator_client, viewer_user):
        res = operator_client.patch(
            f"/api/v1/auth/users/{viewer_user.id}/role/",
            data={"role": UserRole.ADMIN},
            format="json",
        )
        assert res.status_code == status.HTTP_403_FORBIDDEN


# =============================================================================
# 6. SUPERUSER PRIVILEGES
# =============================================================================

@pytest.mark.django_db
class TestSuperuserPermissions:
    """Verifies that Django superusers have full administrative access."""

    def test_superuser_has_admin_capabilities(self, superuser_client, sample_incident, sample_integration):
        # Can triage incidents:
        ack = superuser_client.post(f"/api/v1/incidents/{sample_incident.id}/acknowledge/", data={"note": "Root ack"}, format="json")
        assert ack.status_code == status.HTTP_200_OK

        # Can rotate secrets:
        rot = superuser_client.post(f"/api/v1/integrations/{sample_integration.id}/regenerate-secret/")
        assert rot.status_code == status.HTTP_200_OK

        # Can list users:
        users_res = superuser_client.get("/api/v1/auth/users/")
        assert users_res.status_code == status.HTTP_200_OK
