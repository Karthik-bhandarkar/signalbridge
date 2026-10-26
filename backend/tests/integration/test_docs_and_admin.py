"""
===================================================================================
SignalBridge — Swagger OpenAPI & Django Admin Dashboard Tests
===================================================================================
"""
import pytest
from django.contrib.auth import get_user_model
from rest_framework import status


@pytest.mark.django_db
class TestSwaggerAndAdminDashboard:
    """Validates OpenAPI documentation endpoints and administrative portal access."""

    def test_swagger_ui_dashboard_endpoint_returns_200(self, api_client):
        """Swagger UI interactive testing dashboard loads successfully."""
        response = api_client.get("/api/docs/")
        assert response.status_code == status.HTTP_200_OK
        assert b"swagger-ui" in response.content.lower()

    def test_openapi_schema_endpoint_returns_200(self, api_client):
        """OpenAPI 3.0 schema generation returns HTTP 200 with valid schema."""
        response = api_client.get("/api/schema/")
        assert response.status_code == status.HTTP_200_OK
        assert response.accepted_media_type in (
            "application/vnd.oai.openapi",
            "application/yaml",
            "application/json",
        )

    def test_admin_login_page_renders_200(self, api_client):
        """Django admin portal login form renders with HTTP 200."""
        response = api_client.get("/admin/login/")
        assert response.status_code == status.HTTP_200_OK

    def test_authenticated_admin_accesses_model_indexes(self, client):
        """Superuser logs in and accesses incident change list dashboard."""
        User = get_user_model()
        admin_user = User.objects.create_superuser(
            username="admin_test_user",
            email="admin_test@signalbridge.io",
            password="test_password_123",
        )
        client.force_login(admin_user)
        response = client.get("/admin/alerts/incident/")
        assert response.status_code == status.HTTP_200_OK
