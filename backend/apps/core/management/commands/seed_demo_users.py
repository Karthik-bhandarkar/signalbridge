"""
===================================================================================
SignalBridge — Idempotent Management Command: Seed Demo Users
===================================================================================
PURPOSE:
    Seeds non-privileged Demo Operator and Demo Viewer accounts for public review.
    Passwords are cryptographically hashed using PBKDF2-SHA256 (never stored plaintext).
    The command is strictly idempotent and safe to run multiple times.
===================================================================================
"""
from django.core.management.base import BaseCommand
from django.contrib.auth import get_user_model
from apps.core.models import UserProfile, UserRole

DEMO_ACCOUNTS = [
    {
        "username": "demo.operator",
        "first_name": "Demo",
        "last_name": "Operator",
        "email": "demo.operator@signalbridge.io",
        "password": "OperatorPass!2026#Secure",
        "role": UserRole.OPERATOR,
        "is_staff": False,
        "is_superuser": False,
    },
    {
        "username": "demo.viewer",
        "first_name": "Demo",
        "last_name": "Viewer",
        "email": "demo.viewer@signalbridge.io",
        "password": "ViewerPass!2026#Secure",
        "role": UserRole.VIEWER,
        "is_staff": False,
        "is_superuser": False,
    },
]


class Command(BaseCommand):
    help = "Seeds idempotent demo operator and viewer accounts with hashed passwords."

    def handle(self, *args, **options):
        User = get_user_model()
        created_count = 0
        updated_count = 0

        for account in DEMO_ACCOUNTS:
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

            # Ensure password is securely hashed and updated
            user.first_name = account["first_name"]
            user.last_name = account["last_name"]
            user.email = account["email"]
            user.is_staff = account["is_staff"]
            user.is_superuser = account["is_superuser"]
            user.is_active = True
            user.set_password(account["password"])
            user.save()

            # Ensure RBAC Profile exists
            profile, _ = UserProfile.objects.get_or_create(user=user)
            profile.role = account["role"]
            profile.save()

            if created:
                created_count += 1
                self.stdout.write(self.style.SUCCESS(f"Created demo account: {username} ({account['role']})"))
            else:
                updated_count += 1
                self.stdout.write(self.style.NOTICE(f"Updated demo account: {username} ({account['role']})"))

        self.stdout.write(
            self.style.SUCCESS(
                f"Successfully seeded demo users. Created: {created_count}, Updated: {updated_count}."
            )
        )

