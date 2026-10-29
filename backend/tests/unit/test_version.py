import pytest
from rest_framework.test import APIClient


@pytest.mark.django_db
def test_version_endpoint():
    client = APIClient()
    response = client.get("/api/v1/version/")
    assert response.status_code == 200
    data = response.json()
    assert "service" in data
    assert "git_commit" in data
    assert "build_time" in data
    assert "environment" in data
    assert data["service"] == "SignalBridge Webhook Engine"
