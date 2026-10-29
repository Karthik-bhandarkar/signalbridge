"""
===================================================================================
SignalBridge Webhook Ingestion Engine — Core Abstract Base Models
===================================================================================
PURPOSE:
    This module defines the foundational abstract base models shared across all
    microservices and domain applications in SignalBridge.

ARCHITECTURAL PRINCIPLES:
    1. UUID Primary Keys: Standard auto-incrementing integer IDs (1, 2, 3...) leak
       system volume and are vulnerable to enumeration attacks. Universally Unique
       Identifiers (UUIDv4) generate 128-bit random IDs that are globally collision-free
       and safe to expose over public REST APIs.
    2. Immutable Timestamps: In high-throughput incident pipelines, auditability is
       critical. Every entity tracks exact creation ('created_at') and modification
       ('updated_at') timestamps in UTC with database-level indexes.
    3. Abstract Inheritance: 'TimeStampedUUIDModel' sets 'abstract = True', meaning
       Django will NOT create a separate database table for it; instead, its columns
       are inherited directly by concrete domain tables.
===================================================================================
"""
# Python Standard Library:
# 'uuid' generates 128-bit Universally Unique Identifiers (RFC 4122).
import uuid

# Django ORM Models Framework:
from django.db import models


class TimeStampedUUIDModel(models.Model):
    """
    Abstract base model providing UUID primary keys and audit timestamps.

    Inherited by:
        - WebhookSource (apps.webhooks)
        - IngestedPayload (apps.webhooks)
        - Incident (apps.alerts)
        - Alert (apps.alerts)
        - IncidentEvent (apps.alerts)
    """

    # -----------------------------------------------------------------------------
    # 1. PRIMARY KEY: Universally Unique Identifier (UUIDv4)
    # -----------------------------------------------------------------------------
    # - primary_key=True: Replaces Django's default auto-incrementing integer 'id'.
    # - default=uuid.uuid4: Automatically calls Python's random UUID generator.
    # - editable=False: Prevents accidental mutation via forms or Django Admin.
    id = models.UUIDField(
        primary_key=True,
        default=uuid.uuid4,
        editable=False,
        help_text="Globally unique 128-bit identifier for this record."
    )

    # -----------------------------------------------------------------------------
    # 2. CREATION TIMESTAMP
    # -----------------------------------------------------------------------------
    # - auto_now_add=True: Automatically populates the current UTC timestamp on INSERT.
    # - db_index=True: Builds a B-Tree index for fast chronological sorting and filtering.
    created_at = models.DateTimeField(
        auto_now_add=True,
        db_index=True,
        help_text="Exact timestamp (UTC) when this record was inserted."
    )

    # -----------------------------------------------------------------------------
    # 3. MODIFICATION TIMESTAMP
    # -----------------------------------------------------------------------------
    # - auto_now=True: Automatically updates to the current UTC timestamp on every UPDATE.
    updated_at = models.DateTimeField(
        auto_now=True,
        help_text="Exact timestamp (UTC) when this record was last modified."
    )

    class Meta:
        # 'abstract = True' tells Django ORM NOT to create a database table for this class.
        # Its fields are injected directly into child models that inherit from it.
        abstract = True
        # Default chronological sorting: newest records first.
        ordering = ["-created_at"]


# =============================================================================
# ROLE-BASED ACCESS CONTROL (RBAC) MODELS
# =============================================================================

class UserRole(models.TextChoices):
    """
    Effective permission tiers for SignalBridge operator accounts:
      - VIEWER: Read-only access to operational information (incidents, alerts, services, metrics).
      - OPERATOR: Viewer capabilities + incident triage (acknowledge, assign, resolve, reopen, notes), alert retries.
      - ADMIN: Operator capabilities + integration management, secret rotation, notification destination config.
    """
    VIEWER = "VIEWER", "Viewer"
    OPERATOR = "OPERATOR", "Operator"
    ADMIN = "ADMIN", "Admin"


class UserProfile(TimeStampedUUIDModel):
    """
    User profile model extending standard Django auth User with an RBAC permission role.
    Superusers automatically possess full administrative capabilities regardless of role.
    """
    user = models.OneToOneField(
        "auth.User",
        on_delete=models.CASCADE,
        related_name="profile",
        help_text="Underlying Django auth user record."
    )
    role = models.CharField(
        max_length=20,
        choices=UserRole.choices,
        default=UserRole.VIEWER,  # Safe default: least privilege
        db_index=True,
        help_text="RBAC role defining effective permissions."
    )
    is_demo_user = models.BooleanField(
        default=False,
        db_index=True,
        help_text="Flag indicating public demo operator or viewer account."
    )

    class Meta:
        verbose_name = "User Profile"
        verbose_name_plural = "User Profiles"
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.user.username} ({self.role})"


def get_user_role(user) -> str:
    """
    Utility function resolving the effective role for an authenticated user.
    - Superusers always resolve to ADMIN.
    - Profiles resolve to their explicit role.
    - Unauthenticated users resolve to 'ANONYMOUS'.
    - Existing users lacking a profile resolve to VIEWER (safe least-privilege fallback).
    """
    if not user or not user.is_authenticated:
        return "ANONYMOUS"
    if user.is_superuser:
        return UserRole.ADMIN
    try:
        profile = getattr(user, "profile", None)
        if profile and profile.role:
            return profile.role
    except Exception:
        pass
    if getattr(user, "is_staff", False):
        return UserRole.OPERATOR
    return UserRole.VIEWER

