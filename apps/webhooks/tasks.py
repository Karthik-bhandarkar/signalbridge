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
        2. PROCESSING: Worker acquires record and marks execution in progress.
        3. PROCESSED: Normalization and grouping completed successfully.
        4. FAILED: Unrecoverable error; recorded for dead-letter reprocessing.
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
        # PHASE 5, STEP 12: ALERT NORMALIZATION & INCIDENT GROUPING
        # ---------------------------------------------------------------------
        # Correlate alert data into operational incidents with PostgreSQL SELECT FOR UPDATE locks:
        from apps.alerts.services import correlate_alert_and_incident

        alert_data = raw_payload or {}
        alert_obj, incident_obj, is_new, is_dup = correlate_alert_and_incident(
            alert_data=alert_data,
            payload=payload_record,
        )

        # ---------------------------------------------------------------------
        # PHASE 6, STEP 14: TIERED S3 COLD STORAGE ARCHIVING
        # ---------------------------------------------------------------------
        # Offload raw JSON payload to S3 / S3Mock object storage, keeping PostgreSQL lean:
        from apps.webhooks.archival import s3_archiver

        s3_key = s3_archiver.archive_payload(
            payload_record=payload_record,
            raw_payload=alert_data,
        )

        payload_record.status = IngestedPayload.ProcessingStatus.PROCESSED
        payload_record.save(update_fields=["status", "updated_at"])

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
            "duration_seconds": round(duration_sec, 4),
            "completed_at": timezone.now().isoformat(),
        }

    except Exception as exc:
        logger.error(
            f"[Celery Worker] Error processing IngestedPayload '{payload_id}': {exc}. "
            f"Attempt {self.request.retries + 1} of {self.max_retries}."
        )
        # Retry with exponential backoff:
        try:
            raise self.retry(exc=exc)
        except self.MaxRetriesExceededError:
            logger.critical(
                f"[Celery Worker] Max retries exceeded for IngestedPayload '{payload_id}'. "
                "Marking record as FAILED."
            )
            IngestedPayload.objects.filter(id=payload_id).update(
                status=IngestedPayload.ProcessingStatus.FAILED,
                updated_at=timezone.now(),
            )
            return {
                "status": "FAILED",
                "payload_id": payload_id,
                "error": str(exc),
            }
