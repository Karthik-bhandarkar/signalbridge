"""
===================================================================================
SignalBridge Webhook Ingestion Engine — Alert Deduplication Subsystem
===================================================================================
PURPOSE:
    This module provides deterministic hashing and database-backed deduplication
    verification for individual Alert entities.

ARCHITECTURAL PRINCIPLES:
    1. Composite B-Tree Index Utilization:
       Lookups leverage the 'idx_alert_dedup_time' index on:
       (service_name, deduplication_hash, -created_at).
       This allows PostgreSQL to perform an O(log N) B-Tree index scan rather than
       a slow sequential table scan across millions of historical alert records.

    2. Canonical SHA-256 Hashing:
       Deduplication hashes are computed deterministically from normalized alert
       attributes (service name, correlation fingerprint, and alert title).
===================================================================================
"""
import hashlib
from datetime import timedelta
from typing import Optional

from django.utils import timezone

from apps.alerts.models import Alert


def calculate_alert_dedup_hash(
    service_name: str,
    fingerprint: str,
    title: str,
    custom_key: Optional[str] = None,
) -> str:
    """
    Computes a deterministic 64-character SHA-256 deduplication hash.

    Args:
        service_name: Normalized microservice or subsystem identifier.
        fingerprint: Grouping fingerprint string.
        title: Brief summary of the alarm condition.
        custom_key: Optional caller-specified deduplication token.

    Returns:
        str: 64-character hexadecimal SHA-256 hash digest.
    """
    # Normalize components by stripping surrounding whitespace and converting to lowercase:
    norm_service = (service_name or "").strip().lower()
    norm_fingerprint = (fingerprint or "").strip().lower()
    norm_title = (title or "").strip().lower()

    if custom_key:
        canonical_input = f"{norm_service}:{norm_fingerprint}:{custom_key.strip().lower()}"
    else:
        canonical_input = f"{norm_service}:{norm_fingerprint}:{norm_title}"

    return hashlib.sha256(canonical_input.encode("utf-8")).hexdigest()


def calculate_content_hash(
    service_name: str,
    title: str,
    description: str = "",
    severity: str = "",
) -> str:
    """
    Computes a canonical SHA-256 hash of alert content to detect 409 Conflict.
    If the same external_id arrives with materially different content, the hashes differ.
    """
    canonical_parts = [
        (service_name or "").strip().lower(),
        (title or "").strip().lower(),
        (description or "").strip().lower(),
        (severity or "").strip().upper(),
    ]
    canonical_str = ":".join(canonical_parts)
    return hashlib.sha256(canonical_str.encode("utf-8")).hexdigest()


def find_existing_external_alert(source, external_id: str) -> Optional[Alert]:
    """
    Looks up an alert by source and stable vendor external_id.
    """
    if not external_id or not source:
        return None
    return Alert.objects.filter(source=source, external_id=str(external_id).strip()).first()


def is_alert_duplicate(
    service_name: str,
    dedup_hash: str,
    window_seconds: int = 300,
) -> bool:
    """
    Checks if an alert with identical service and hash was recorded within the given window.

    Args:
        service_name: Service name to filter by (first column of composite index).
        dedup_hash: SHA-256 deduplication hash (second column of composite index).
        window_seconds: Time window in seconds (default 300s = 5 minutes).

    Returns:
        bool: True if an identical alert exists within the deduplication window.
    """
    cutoff_time = timezone.now() - timedelta(seconds=window_seconds)

    # Uses composite index: idx_alert_dedup_time (service_name, deduplication_hash, -created_at)
    return Alert.objects.filter(
        service_name=service_name,
        deduplication_hash=dedup_hash,
        created_at__gte=cutoff_time,
    ).exists()

