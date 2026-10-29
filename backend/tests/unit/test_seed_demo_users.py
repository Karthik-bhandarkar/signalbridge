import pytest
from django.core.management import call_command
from django.contrib.auth import get_user_model
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
    assert admin.is_staff is True
    assert admin.is_superuser is True
    assert admin.profile.role == UserRole.ADMIN
    assert admin.profile.is_demo_user is False

