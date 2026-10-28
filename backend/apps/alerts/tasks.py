"""
===================================================================================
SignalBridge — Alert & Incident Background Celery Tasks
===================================================================================
PURPOSE:
    Background tasks for incident maintenance and scheduled housekeeping jobs.
===================================================================================
"""
import logging
from datetime import timedelta
from celery import shared_task
from django.utils import timezone
from apps.alerts.models import Incident, Alert
from apps.webhooks.models import IngestedPayload

logger = logging.getLogger(__name__)


@shared_task(name="apps.alerts.tasks.reset_demo_data_nightly")
def reset_demo_data_nightly():
    """
    Nightly Celery beat job resetting demo simulator data:
    Deletes simulator incidents older than 24h, and cleans up stale synthetic payloads.
    """
    cutoff = timezone.now() - timedelta(hours=24)
    logger.info(f"[Demo Reset] Starting nightly cleanup of simulated data older than {cutoff.isoformat()}...")

    deleted_incidents, _ = Incident.objects.filter(is_simulated=True, created_at__lt=cutoff).delete()
    deleted_alerts, _ = Alert.objects.filter(is_simulated=True, created_at__lt=cutoff).delete()
    deleted_payloads, _ = IngestedPayload.objects.filter(is_simulated=True, created_at__lt=cutoff).delete()

    logger.info(
        f"[Demo Reset] Nightly reset completed: {deleted_incidents} incidents, "
        f"{deleted_alerts} alerts, {deleted_payloads} payloads purged."
    )
    return {
        "deleted_incidents": deleted_incidents,
        "deleted_alerts": deleted_alerts,
        "deleted_payloads": deleted_payloads,
    }
