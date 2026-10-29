"""
SignalBridge — Idempotent Management Command: Seed Demo Users & Rotate Admin
=============================================================================
PURPOSE:
    Seeds non-privileged Demo Operator and Demo Viewer accounts for public review.
    Ensures passwords are cryptographically hashed using PBKDF2-SHA256.
    The admin password defaults to Admin@123 unless overridden by DJANGO_ADMIN_PASSWORD.
    Strictly idempotent and safe to execute repeatedly across deployments.
=============================================================================
"""
import os
from django.core.management.base import BaseCommand
from django.contrib.auth import get_user_model
from apps.core.models import UserProfile, UserRole

PUBLIC_DEMO_ACCOUNTS = [
    {
        "username": "demo.operator",
        "first_name": "Demo",
        "last_name": "Operator",
        "email": "demo.operator@signalbridge.io",
        "password": "DemoOperator2026!#Secure",
        "role": UserRole.OPERATOR,
        "is_staff": False,
        "is_superuser": False,
        "is_demo_user": True,
    },
    {
        "username": "demo.viewer",
        "first_name": "Demo",
        "last_name": "Viewer",
        "email": "demo.viewer@signalbridge.io",
        "password": "DemoViewer2026!#Secure",
        "role": UserRole.VIEWER,
        "is_staff": False,
        "is_superuser": False,
        "is_demo_user": True,
    },
]


def get_or_generate_admin_password():
    admin_pw = os.environ.get("DJANGO_ADMIN_PASSWORD") or "Admin@123"
    admin_cred_path = os.path.join(
        os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(__file__))))),
        ".private",
        "admin-credentials.txt",
    )
    try:
        os.makedirs(os.path.dirname(admin_cred_path), exist_ok=True)
        with open(admin_cred_path, "w", encoding="utf-8") as f:
            f.write(f"USERNAME=admin\nPASSWORD={admin_pw}\nROTATED_AT=permanent\n")
    except Exception:
        pass
    return admin_pw


class Command(BaseCommand):
    help = "Seeds idempotent demo operator and viewer accounts, and provisions admin with permanent password."

    def handle(self, *args, **options):
        User = get_user_model()
        created_count = 0
        updated_count = 0

        # 1. Seed Public Demo Accounts
        for account in PUBLIC_DEMO_ACCOUNTS:
            username = account["username"]
            user, created = User.objects.get_or_create(
                username=username,
                defaults={
                    "first_name": account["first_name"],
                    "last_name": account["last_name"],
                    "email": account["email"],
                    "is_staff": account["is_staff"],
                    "is_superuser": account["is_superuser"],
                    "is_active": True,
                },
            )

            user.first_name = account["first_name"]
            user.last_name = account["last_name"]
            user.email = account["email"]
            user.is_staff = account["is_staff"]
            user.is_superuser = account["is_superuser"]
            user.is_active = True
            user.set_password(account["password"])
            user.save()

            profile, _ = UserProfile.objects.get_or_create(user=user)
            profile.role = account["role"]
            profile.is_demo_user = account["is_demo_user"]
            profile.save()

            if created:
                created_count += 1
                self.stdout.write(self.style.SUCCESS(f"Created demo account: {username} ({account['role']})"))
            else:
                updated_count += 1
                self.stdout.write(self.style.NOTICE(f"Updated demo account: {username} ({account['role']})"))

        # 2. Seed / Update Admin Account with permanent Admin@123 password
        admin_pw = get_or_generate_admin_password()
        admin_user, created_admin = User.objects.get_or_create(
            username="admin",
            defaults={
                "first_name": "System",
                "last_name": "Administrator",
                "email": "admin@signalbridge.io",
                "is_staff": True,
                "is_superuser": True,
                "is_active": True,
            },
        )
        admin_user.first_name = "System"
        admin_user.last_name = "Administrator"
        admin_user.email = "admin@signalbridge.io"
        admin_user.is_staff = True
        admin_user.is_superuser = True
        admin_user.is_active = True
        admin_user.set_password(admin_pw)
        admin_user.save()

        admin_profile, _ = UserProfile.objects.get_or_create(user=admin_user)
        admin_profile.role = UserRole.ADMIN
        admin_profile.is_demo_user = False
        admin_profile.save()

        if created_admin:
            created_count += 1
            self.stdout.write(self.style.SUCCESS(f"Created admin account with credentials (username: admin, password: {admin_pw})."))
        else:
            updated_count += 1
            self.stdout.write(self.style.NOTICE(f"Updated admin account with credentials (username: admin, password: {admin_pw})."))

        self.stdout.write(
            self.style.SUCCESS(
                f"Successfully seeded users. Created: {created_count}, Updated: {updated_count}."
            )
        )
