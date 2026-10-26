"""
===================================================================================
SignalBridge — Webhook Ingestion Engine: Asynchronous Celery Tasks
===================================================================================
PURPOSE:
    This module defines the Celery asynchronous background tasks responsible for
    consuming and processing incoming webhook payloads out-of-band.

ARCHITECTURAL PRINCIPLES:
    1. Sub-100ms HTTP Gateway Decoupling:
       The Django web process acknowledges incoming HTTP POST requests with
       HTTP 202 Accepted within < 50ms, offloading database-intensive normalization,
       cold-storage S3 uploading, and alert grouping to this asynchronous worker.

    2. Task Message Broker Mechanics:
       - Producer: 'WebhookIngestionAPIView' calls 'process_webhook.delay(...)'.
       - Broker: Redis 7 Database 1 ('redis://redis:6379/1') queues the JSON message.
       - Consumer: Celery Worker daemon pulls tasks and executes them asynchronously.
       - Result Backend: Redis Database 2 ('redis://redis:6379/2') stores task metadata.

    3. Fault Tolerance & Idempotent Execution:
       - Primitive Arguments: We pass string UUIDs ('payload_id: str') rather than
         serialized Django ORM model instances to prevent state desynchronization.
       - Late ACKs ('CELERY_ACKS_LATE = True'): Ensures that if a container restarts
         mid-task, the message is not lost and is re-delivered to another worker.
===================================================================================
"""
import logging
import time
from datetime import timedelta
from typing import Any, Dict, Optional

from celery import shared_task
from django.utils import timezone

from apps.webhooks.models import IngestedPayload

logger = logging.getLogger(__name__)


@shared_task(
    bind=True,
    name="apps.webhooks.tasks.process_webhook",
    max_retries=3,
    default_retry_delay=5,
    acks_late=True,
)
def process_webhook(
    self,
    payload_id: str,
    raw_payload: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """
    Asynchronously processes an ingested webhook payload.

    Args:
        self: Bound Celery Task instance providing access to retry mechanics and request metadata.
        payload_id: UUID primary key of the IngestedPayload record in PostgreSQL.
        raw_payload: Optional unparsed payload dictionary forwarded from the gateway.

    Returns:
        Dict[str, Any]: Execution summary containing processing status and execution duration.

    Lifecycle Stages:
        1. PENDING: Initial state recorded by HTTP gateway before enqueuing.
        2. PROCESSING: Worker acquires record, increments attempt_count, and sets last_attempt_at.
        3. PROCESSED: Normalization and grouping completed successfully; idempotent on redelivery.
        4. FAILED: Unrecoverable error; recorded for dead-letter inspection.
    """
    start_time = time.time()
    logger.info(f"[Celery Worker] Starting processing for IngestedPayload ID: {payload_id}")

    try:
        # Retrieve the durable payload record from PostgreSQL:
        payload_record = IngestedPayload.objects.filter(id=payload_id).first()

        if not payload_record:
            logger.warning(
                f"[Celery Worker] IngestedPayload with ID '{payload_id}' was not found. "
                "Task aborting (possible rollback or premature execution)."
            )
            return {
                "status": "NOT_FOUND",
                "payload_id": payload_id,
                "error": "Record does not exist in database.",
            }

        # ---------------------------------------------------------------------
        # IDEMPOTENT REDELIVERY CHECK:
        # If worker crashes after work or message broker delivers duplicate,
        # return immediately without re-correlating or corrupting alert counts.
        # ---------------------------------------------------------------------
        if payload_record.status == IngestedPayload.ProcessingStatus.PROCESSED:
            logger.info(
                f"[Celery Worker] IngestedPayload '{payload_id}' is already PROCESSED. "
                "Safely skipping re-execution."
            )
            return {
                "status": "ALREADY_PROCESSED",
                "payload_id": str(payload_record.id),
                "tracking_id": payload_record.tracking_id,
                "message": "Payload was previously processed; redelivery ignored safely.",
            }

        # ---------------------------------------------------------------------
        # MARK PROCESSING STATE & INCREMENT ATTEMPT COUNT
        # ---------------------------------------------------------------------
        payload_record.status = IngestedPayload.ProcessingStatus.PROCESSING
        payload_record.attempt_count += 1
        payload_record.last_attempt_at = timezone.now()
        payload_record.save(update_fields=["status", "attempt_count", "last_attempt_at", "updated_at"])

        # ---------------------------------------------------------------------
        # ALERT NORMALIZATION & INCIDENT GROUPING
        # ---------------------------------------------------------------------
        # Correlate alert data into operational incidents with PostgreSQL SELECT FOR UPDATE locks:
        from apps.alerts.services import correlate_alert_and_incident

        alert_data = raw_payload or {}
        alert_obj, incident_obj, is_new, is_dup = correlate_alert_and_incident(
            alert_data=alert_data,
            payload=payload_record,
        )

        # ---------------------------------------------------------------------
        # TIERED S3 COLD STORAGE ARCHIVING
        # ---------------------------------------------------------------------
        # Offload raw JSON payload to S3 / S3Mock object storage, keeping PostgreSQL lean:
        from apps.webhooks.archival import s3_archiver

        s3_key = s3_archiver.archive_payload(
            payload_record=payload_record,
            raw_payload=alert_data,
        )

        payload_record.status = IngestedPayload.ProcessingStatus.PROCESSED
        payload_record.error_message = None
        payload_record.save(update_fields=["status", "error_message", "updated_at"])

        duration_sec = time.time() - start_time
        logger.info(
            f"[Celery Worker] Successfully processed IngestedPayload '{payload_id}' "
            f"(Tracking ID: {payload_record.tracking_id}, Incident: {incident_obj.id}, "
            f"Alerts in incident: {incident_obj.alert_count}, S3 Key: {s3_key}) in {duration_sec:.4f}s"
        )

        return {
            "status": "PROCESSED",
            "payload_id": str(payload_record.id),
            "tracking_id": payload_record.tracking_id,
            "incident_id": str(incident_obj.id),
            "alert_id": str(alert_obj.id),
            "is_new_incident": is_new,
            "is_duplicate_alert": is_dup,
            "incident_alert_count": incident_obj.alert_count,
            "archive_status": payload_record.archive_status,
            "duration_seconds": round(duration_sec, 4),
            "completed_at": timezone.now().isoformat(),
        }

    except Exception as exc:
        logger.error(
            f"[Celery Worker] Error processing IngestedPayload '{payload_id}': {exc}. "
            f"Attempt {self.request.retries + 1} of {self.max_retries}."
        )
        try:
            # Update error message and calculate next retry timestamp:
            next_delay = 5 * (2 ** self.request.retries)
            IngestedPayload.objects.filter(id=payload_id).update(
                error_message=str(exc),
                next_retry_at=timezone.now() + timedelta(seconds=next_delay),
                updated_at=timezone.now(),
            )
            raise self.retry(exc=exc, countdown=next_delay)
        except self.MaxRetriesExceededError:
            logger.critical(
                f"[Celery Worker] Max retries exceeded for IngestedPayload '{payload_id}'. "
                "Marking record as FAILED."
            )
            IngestedPayload.objects.filter(id=payload_id).update(
                status=IngestedPayload.ProcessingStatus.FAILED,
                error_message=f"Max retries exceeded: {exc}",
                updated_at=timezone.now(),
            )
            return {
                "status": "FAILED",
                "payload_id": payload_id,
                "error": str(exc),
            }


@shared_task(name="apps.webhooks.tasks.reconcile_pending_webhooks")
def reconcile_pending_webhooks(age_minutes: int = 2) -> Dict[str, Any]:
    """
    Finds payloads that remain stuck in PENDING status longer than threshold
    (e.g., due to an unexpected broker connection outage during acceptance)
    and re-queues them to prevent silent data loss.
    """
    cutoff = timezone.now() - timedelta(minutes=age_minutes)
    stuck_payloads = IngestedPayload.objects.filter(
        status=IngestedPayload.ProcessingStatus.PENDING,
        received_at__lt=cutoff,
    )[:100]

    requeued_count = 0
    for payload in stuck_payloads:
        process_webhook.delay(payload_id=str(payload.id))
        requeued_count += 1

    logger.info(f"[Reconciliation] Requeued {requeued_count} pending payloads older than {age_minutes}m.")
    return {"requeued_count": requeued_count, "evaluated_cutoff": cutoff.isoformat()}


@shared_task(name="apps.webhooks.tasks.reclaim_stale_processing_webhooks")
def reclaim_stale_processing_webhooks(stale_minutes: int = 5) -> Dict[str, Any]:
    """
    Finds payloads stuck in PROCESSING status for more than stale_minutes
    (e.g., due to worker container SIGKILL / OOM kill before late ACK),
    resets their status to PENDING or retries them.
    """
    cutoff = timezone.now() - timedelta(minutes=stale_minutes)
    stuck_payloads = IngestedPayload.objects.filter(
        status=IngestedPayload.ProcessingStatus.PROCESSING,
        last_attempt_at__lt=cutoff,
    )[:100]

    reclaimed_count = 0
    for payload in stuck_payloads:
        if payload.attempt_count < 3:
            payload.status = IngestedPayload.ProcessingStatus.PENDING
            payload.save(update_fields=["status", "updated_at"])
            process_webhook.delay(payload_id=str(payload.id))
            reclaimed_count += 1
        else:
            payload.status = IngestedPayload.ProcessingStatus.FAILED
            payload.error_message = "Stale processing timeout; max attempts exhausted."
            payload.save(update_fields=["status", "error_message", "updated_at"])

    logger.info(f"[Reclaim] Reclaimed {reclaimed_count} stale processing payloads.")
    return {"reclaimed_count": reclaimed_count}
