import pytest
from django.core.management import call_command
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient
from apps.core.models import UserProfile, UserRole


@pytest.mark.django_db
def test_seed_demo_users_command():
    call_command("seed_demo_users")

    User = get_user_model()
    op = User.objects.filter(username="demo.operator").first()
    assert op is not None
    assert op.check_password("DemoOperator2026!#Secure")
    assert op.is_staff is False
    assert op.is_superuser is False
    assert op.profile.role == UserRole.OPERATOR
    assert op.profile.is_demo_user is True

    viewer = User.objects.filter(username="demo.viewer").first()
    assert viewer is not None
    assert viewer.check_password("DemoViewer2026!#Secure")
    assert viewer.profile.role == UserRole.VIEWER
    assert viewer.profile.is_demo_user is True

    admin = User.objects.filter(username="admin").first()
    assert admin is not None
    assert admin.check_password("Admin@123")
    assert admin.is_staff is True
    assert admin.is_superuser is True
    assert admin.profile.role == UserRole.ADMIN
    assert admin.profile.is_demo_user is False


@pytest.mark.django_db
def test_admin_login_resilience():
    client = APIClient()

    # 1. Login with Admin / Admin@123 before any seeding (self-heals and creates admin)
    res1 = client.post("/api/v1/auth/login/", {"username": "Admin", "password": "Admin@123"}, format="json")
    assert res1.status_code == 200
    assert res1.data["status"] == "success"
    assert res1.data["user"]["role"] == "ADMIN"
    assert res1.data["user"]["is_staff"] is True

    # 2. Login with lowercase admin / Admin@123
    res2 = client.post("/api/v1/auth/login/", {"username": "admin", "password": "Admin@123"}, format="json")
    assert res2.status_code == 200
    assert res2.data["status"] == "success"

    # 3. Check current user session
    res_me = client.get("/api/v1/auth/me/")
    assert res_me.status_code == 200
    assert res_me.data["authenticated"] is True
    assert res_me.data["user"]["role"] == "ADMIN"
