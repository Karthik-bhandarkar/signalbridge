"""
===================================================================================
SignalBridge — High-Concurrency Incident Row-Locking Test (20 Concurrent Threads)
===================================================================================
PURPOSE:
    This concurrency test simulates 20 parallel worker threads firing simultaneously
    at millisecond 0, all processing alerts for the EXACT SAME service and fingerprint.

ACCEPTANCE CRITERIA:
    1. Exactly 1 Incident record is created in PostgreSQL.
    2. Zero duplicate incidents are spawned.
    3. Exactly 20 Alert records are created, all linked to the single parent Incident.
    4. The parent Incident's 'alert_count' is exactly 20.
===================================================================================
"""
import concurrent.futures
from django.test import TransactionTestCase
from django.db import connection

from apps.alerts.models import Alert, Incident
from apps.alerts.services import correlate_alert_and_incident
from apps.webhooks.models import IngestedPayload, WebhookSource


class IncidentConcurrencyLockingTestCase(TransactionTestCase):
    """
    Validates PostgreSQL SELECT FOR UPDATE row-level locking under high concurrency.
    Uses TransactionTestCase so multiple thread connections interact with real DB transactions.
    """

    def setUp(self):
        self.source = WebhookSource.objects.create(
            name="Datadog Concurrency Cluster",
            slug="datadog-concurrency",
            secret_key="secret-concurrency-token",
        )
        self.payload = IngestedPayload.objects.create(
            source=self.source,
            tracking_id="trk-concurrency-root",
            idempotency_hash="hash-concurrency-initial",
            status=IngestedPayload.ProcessingStatus.PENDING,
        )

    def tearDown(self):
        # Clean up database records after real transaction commits:
        Alert.objects.all().delete()
        Incident.objects.all().delete()
        IngestedPayload.objects.all().delete()
        WebhookSource.objects.all().delete()

    def test_20_concurrent_threads_yield_single_incident(self):
        """
        Spawns 20 concurrent threads firing alerts for the same service and fingerprint.
        Proves row-level locking eliminates duplicate incident race conditions.
        """
        thread_count = 20
        service_name = "payment-gateway"
        fingerprint = "stripe-api-504-gateway-timeout"

        def worker_task(thread_idx: int):
            try:
                alert_data = {
                    "service": service_name,
                    "fingerprint": fingerprint,
                    "severity": "CRITICAL" if thread_idx == 0 else "HIGH",
                    "title": f"Payment Timeout Spike (Thread {thread_idx})",
                    "dedup_key": f"evt-{thread_idx}",  # Unique dedup_key per thread so 20 alerts are created
                }
                alert, incident, is_new, _ = correlate_alert_and_incident(
                    alert_data=alert_data,
                    payload=self.payload,
                )
                return alert.id, incident.id, is_new
            finally:
                # Ensure each worker thread closes its thread-local PostgreSQL connection:
                connection.close()

        # Execute 20 simultaneous threads:
        results = []
        with concurrent.futures.ThreadPoolExecutor(max_workers=thread_count) as executor:
            futures = [executor.submit(worker_task, i) for i in range(thread_count)]
            for future in concurrent.futures.as_completed(futures):
                results.append(future.result())

        # Close all lingering database connections:
        from django.db import connections
        connections.close_all()

        # ---------------------------------------------------------------------
        # QUANTITATIVE EVIDENCE ASSERTIONS
        # ---------------------------------------------------------------------
        # 1. Exactly 1 Incident created in database:
        matching_incidents = Incident.objects.filter(
            service_name=service_name,
            fingerprint=fingerprint,
        )
        incident_count = matching_incidents.count()
        self.assertEqual(
            incident_count,
            1,
            f"Race condition detected! Expected 1 Incident, found {incident_count}.",
        )

        # 2. Exactly 20 Alerts created:
        parent_incident = matching_incidents.first()
        linked_alerts = Alert.objects.filter(incident=parent_incident)
        self.assertEqual(
            linked_alerts.count(),
            thread_count,
            f"Expected {thread_count} alerts, found {linked_alerts.count()}.",
        )

        # 3. Incident alert_count is exactly 20:
        self.assertEqual(
            parent_incident.alert_count,
            thread_count,
            f"Expected alert_count={thread_count}, but found {parent_incident.alert_count}.",
        )

        # 4. Severity escalated to CRITICAL (thread 0 sent CRITICAL):
        self.assertEqual(
            parent_incident.severity,
            Incident.SeverityLevel.CRITICAL,
        )

        # 5. Exactly 1 thread recorded is_new_incident=True, remaining 19 recorded False:
        new_incident_flags = [res[2] for res in results]
        self.assertEqual(new_incident_flags.count(True), 1)
        self.assertEqual(new_incident_flags.count(False), thread_count - 1)
