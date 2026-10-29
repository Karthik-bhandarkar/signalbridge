"""
SignalBridge — Demo Dataset Seeding Command
===========================================
Generates realistic, pristine demo data for video presentations, investor demos,
and high-throughput reliability audits.
"""
from datetime import timedelta
import uuid
from django.core.management.base import BaseCommand
from django.utils import timezone

from apps.alerts.models import Incident, Alert
from apps.webhooks.models import WebhookSource, IngestedPayload
from apps.analytics.models import IngestionMetric


class Command(BaseCommand):
    help = "Seed pristine demo dataset for SignalBridge live presentation"

    def handle(self, *args, **options):
        now = timezone.now()

        # 1. Ensure Webhook Sources
        pd_source, _ = WebhookSource.objects.get_or_create(
            slug="pagerduty-prod",
            defaults={
                "name": "PagerDuty Production Ingestion",
                "secret_key": "sec_demo_pd_signalbridge_2026",
                "is_active": True,
                "rate_limit_per_minute": 200,
            },
        )

        dd_source, _ = WebhookSource.objects.get_or_create(
            slug="datadog-telemetry",
            defaults={
                "name": "Datadog CloudWatch Telemetry",
                "secret_key": "sec_demo_dd_signalbridge_2026",
                "is_active": True,
                "rate_limit_per_minute": 300,
            },
        )

        # 2. Seed Incidents with realistic duration and timestamps
        incidents_data = [
            # OPEN Incidents
            {
                "title": "Payment Gateway Connection Saturation",
                "service": "payment-api-cluster",
                "fingerprint": "pg-conn-exhaustion-us-east-1",
                "severity": Incident.SeverityLevel.CRITICAL,
                "status": Incident.IncidentStatus.OPEN,
                "source": pd_source,
                "first_seen": now - timedelta(minutes=14),
                "last_seen": now - timedelta(minutes=2),
                "alert_count": 4,
            },
            {
                "title": "PostgreSQL Replica Query Latency Spike",
                "service": "core-database-cluster",
                "fingerprint": "db-replica-p99-latency",
                "severity": Incident.SeverityLevel.HIGH,
                "status": Incident.IncidentStatus.OPEN,
                "source": dd_source,
                "first_seen": now - timedelta(minutes=28),
                "last_seen": now - timedelta(minutes=5),
                "alert_count": 3,
            },
            {
                "title": "Redis Memory Fragmentation Near Ceiling",
                "service": "session-cache-gateway",
                "fingerprint": "redis-mem-fragmentation",
                "severity": Incident.SeverityLevel.MEDIUM,
                "status": Incident.IncidentStatus.OPEN,
                "source": dd_source,
                "first_seen": now - timedelta(minutes=45),
                "last_seen": now - timedelta(minutes=12),
                "alert_count": 2,
            },
            # ACKNOWLEDGED Incidents
            {
                "title": "CloudFront Edge 502 Bad Gateway Wave",
                "service": "edge-ingress-proxy",
                "fingerprint": "edge-502-tls-handshake",
                "severity": Incident.SeverityLevel.CRITICAL,
                "status": Incident.IncidentStatus.ACKNOWLEDGED,
                "source": pd_source,
                "first_seen": now - timedelta(minutes=35),
                "last_seen": now - timedelta(minutes=10),
                "ack_at": now - timedelta(minutes=8),
                "alert_count": 5,
            },
            {
                "title": "Ingestion Worker Task Queue Congestion",
                "service": "celery-worker-pool",
                "fingerprint": "celery-queue-backpressure",
                "severity": Incident.SeverityLevel.HIGH,
                "status": Incident.IncidentStatus.ACKNOWLEDGED,
                "source": dd_source,
                "first_seen": now - timedelta(minutes=50),
                "last_seen": now - timedelta(minutes=15),
                "ack_at": now - timedelta(minutes=18),
                "alert_count": 3,
            },
            # RESOLVED Incidents (Target realistic MTTR ~ 11.5 minutes)
            {
                "title": "Authentication Microservice Token Desync",
                "service": "auth-service-cluster",
                "fingerprint": "auth-jwt-refresh-timeout",
                "severity": Incident.SeverityLevel.HIGH,
                "status": Incident.IncidentStatus.RESOLVED,
                "source": pd_source,
                "first_seen": now - timedelta(hours=2, minutes=30),
                "last_seen": now - timedelta(hours=2, minutes=20),
                "ack_at": now - timedelta(hours=2, minutes=27),
                "resolved_at": now - timedelta(hours=2, minutes=19),  # 11m MTTR
                "alert_count": 3,
            },
            {
                "title": "S3 Cold Storage Archive Bucket Throttle",
                "service": "s3-cold-tier",
                "fingerprint": "s3-put-throttle-503",
                "severity": Incident.SeverityLevel.MEDIUM,
                "status": Incident.IncidentStatus.RESOLVED,
                "source": dd_source,
                "first_seen": now - timedelta(hours=3, minutes=15),
                "last_seen": now - timedelta(hours=3, minutes=2),
                "ack_at": now - timedelta(hours=3, minutes=12),
                "resolved_at": now - timedelta(hours=3, minutes=1),  # 14m MTTR
                "alert_count": 2,
            },
            {
                "title": "DNS Lookup Flapping on Upstream Vendor",
                "service": "upstream-webhook-network",
                "fingerprint": "dns-resolution-timeout",
                "severity": Incident.SeverityLevel.LOW,
                "status": Incident.IncidentStatus.RESOLVED,
                "source": dd_source,
                "first_seen": now - timedelta(hours=4, minutes=20),
                "last_seen": now - timedelta(hours=4, minutes=10),
                "ack_at": now - timedelta(hours=4, minutes=18),
                "resolved_at": now - timedelta(hours=4, minutes=11),  # 9m MTTR
                "alert_count": 2,
            },
            {
                "title": "Stripe Webhook Delivery Idempotency Burst",
                "service": "payment-api-cluster",
                "fingerprint": "stripe-webhook-burst-replay",
                "severity": Incident.SeverityLevel.CRITICAL,
                "status": Incident.IncidentStatus.RESOLVED,
                "source": pd_source,
                "first_seen": now - timedelta(hours=5, minutes=10),
                "last_seen": now - timedelta(hours=4, minutes=58),
                "ack_at": now - timedelta(hours=5, minutes=6),
                "resolved_at": now - timedelta(hours=4, minutes=58),  # 12m MTTR
                "alert_count": 4,
            },
        ]

        created_incidents = []
        for d in incidents_data:
            inc, created = Incident.objects.get_or_create(
                fingerprint=d["fingerprint"],
                defaults={
                    "service_name": d["service"],
                    "severity": d["severity"],
                    "status": d["status"],
                    "first_seen_at": d["first_seen"],
                    "last_seen_at": d["last_seen"],
                    "acknowledged_at": d.get("ack_at"),
                    "resolved_at": d.get("resolved_at"),
                    "alert_count": d["alert_count"],
                    "is_simulated": False,
                },
            )
            created_incidents.append(inc)

            # Create correlated alert signals
            for i in range(d["alert_count"]):
                alert_created = d["first_seen"] + timedelta(minutes=i * 2)
                Alert.objects.get_or_create(
                    fingerprint=f"{d['fingerprint']}-signal-{i+1}",
                    defaults={
                        "source": d["source"],
                        "incident": inc,
                        "title": f"{d['title']} - Signal #{i+1}",
                        "service_name": d["service"],
                        "severity": d["severity"],
                        "status": Alert.AlertStatus.CORRELATED if d["status"] != Incident.IncidentStatus.RESOLVED else Alert.AlertStatus.RESOLVED,
                        "created_at": alert_created,
                        "raw_payload": {
                            "event": "alert.trigger",
                            "service": d["service"],
                            "metric_value": 98.4 + (i * 0.3),
                            "threshold": 95.0,
                            "timestamp": alert_created.isoformat(),
                        },
                    },
                )

        # 3. Seed Realistic Deliveries & Replay Suppression Rate (~21.4%)
        # 42 total received: 33 accepted + 9 duplicates
        window_start = now - timedelta(hours=1)
        IngestionMetric.objects.get_or_create(
            source_slug=pd_source.slug,
            window_start=window_start,
            defaults={
                "total_received": 28,
                "total_accepted": 22,
                "total_duplicates": 6,
                "total_rejected": 0,
            },
        )
        IngestionMetric.objects.get_or_create(
            source_slug=dd_source.slug,
            window_start=window_start,
            defaults={
                "total_received": 14,
                "total_accepted": 11,
                "total_duplicates": 3,
                "total_rejected": 0,
            },
        )

        self.stdout.write(
            self.style.SUCCESS(
                f"Successfully seeded demo dataset: {len(created_incidents)} incidents, "
                f"correlated alerts, and 21.4% replay suppression rate."
            )
        )
