"""
SignalBridge — KPI Database vs API Reconciliation Test
======================================================
Verifies that:
1. Deliveries 24h, Replay Suppression Rate, and MTTR all strictly observe the 24-hour boundary.
2. Incidents and metrics older than 24 hours are excluded from the 24h KPIs.
3. Open incidents definitions are mathematically identical between raw SQL and API responses.
"""
from datetime import timedelta
import pytest
from django.utils import timezone
from django.db import connection
from rest_framework.test import APIClient

from apps.webhooks.models import WebhookSource, IngestedPayload
from apps.analytics.models import IngestionMetric
from apps.alerts.models import Incident, Alert


@pytest.mark.django_db
class TestKPISQLReconciliation:

    @pytest.fixture(autouse=True)
    def setup_data(self):
        now = timezone.now()
        source = WebhookSource.objects.create(
            name="Test Source",
            slug="test-source",
            secret_key="test_secret_32_characters_minimum_len",
            is_active=True,
        )

        # -------------------------------------------------------------
        # 1. 24h Window Data (Recent, within 24h)
        # -------------------------------------------------------------
        # Metric within 24h: 100 received (80 accepted + 20 duplicates -> 20.0% replay rate)
        recent_metric = IngestionMetric.objects.create(
            source_slug=source.slug,
            window_start=now - timedelta(hours=2),
            total_received=100,
            total_accepted=80,
            total_duplicates=20,
            total_rejected=0,
        )

        # Incident A: OPEN (Active)
        inc_open = Incident.objects.create(
            service_name="api-gateway",
            fingerprint="test-fp-open",
            status=Incident.IncidentStatus.OPEN,
            severity=Incident.SeverityLevel.HIGH,
            is_simulated=False,
        )
        Incident.objects.filter(id=inc_open.id).update(
            first_seen_at=now - timedelta(hours=4),
            last_seen_at=now - timedelta(hours=1),
        )

        # Incident B: ACKNOWLEDGED (In Progress)
        inc_ack = Incident.objects.create(
            service_name="db-pool",
            fingerprint="test-fp-ack",
            status=Incident.IncidentStatus.ACKNOWLEDGED,
            severity=Incident.SeverityLevel.CRITICAL,
            is_simulated=False,
        )
        Incident.objects.filter(id=inc_ack.id).update(
            first_seen_at=now - timedelta(hours=3),
            acknowledged_at=now - timedelta(hours=2, minutes=50),
            last_seen_at=now - timedelta(hours=1),
        )

        # Incident C: RESOLVED within 24h (resolved 2h ago, first seen 2h15m ago -> MTTR = 15.0m)
        inc_res_recent = Incident.objects.create(
            service_name="auth-service",
            fingerprint="test-fp-res-recent",
            status=Incident.IncidentStatus.RESOLVED,
            severity=Incident.SeverityLevel.MEDIUM,
            is_simulated=False,
        )
        Incident.objects.filter(id=inc_res_recent.id).update(
            first_seen_at=now - timedelta(hours=2, minutes=15),
            resolved_at=now - timedelta(hours=2),
            last_seen_at=now - timedelta(hours=2),
        )

        # -------------------------------------------------------------
        # 2. Older Than 24h Data (> 24h old, must be EXCLUDED from 24h KPIs)
        # -------------------------------------------------------------
        # Metric 48h ago: 500 received, 100 duplicates (should NOT be added to deliveries_24h)
        old_metric = IngestionMetric.objects.create(
            source_slug=source.slug,
            window_start=now - timedelta(hours=48),
            total_received=500,
            total_accepted=400,
            total_duplicates=100,
            total_rejected=0,
        )

        # Incident D: RESOLVED 36h ago (duration 120.0m - should NOT inflate mttr_minutes!)
        inc_res_old = Incident.objects.create(
            service_name="legacy-worker",
            fingerprint="test-fp-res-old",
            status=Incident.IncidentStatus.RESOLVED,
            severity=Incident.SeverityLevel.LOW,
            is_simulated=False,
        )
        Incident.objects.filter(id=inc_res_old.id).update(
            first_seen_at=now - timedelta(hours=38),
            resolved_at=now - timedelta(hours=36),
            last_seen_at=now - timedelta(hours=36),
        )

        self.now = now
        self.day_ago = now - timedelta(hours=24)

    def test_api_overview_matches_raw_sql_24h_window(self):
        # 1. Execute Raw SQL Queries
        with connection.cursor() as cursor:
            # SQL Deliveries 24h
            cursor.execute(
                "SELECT COALESCE(SUM(total_received), 0) FROM analytics_ingestionmetric WHERE window_start >= %s;",
                [self.day_ago]
            )
            sql_deliveries_24h = cursor.fetchone()[0]

            # SQL Deliveries Lifetime
            cursor.execute("SELECT COALESCE(SUM(total_received), 0) FROM analytics_ingestionmetric;")
            sql_deliveries_total = cursor.fetchone()[0]

            # SQL Replay Suppression Rate 24h
            cursor.execute("""
                SELECT CASE WHEN SUM(total_received) > 0 
                            THEN ROUND(100.0 * SUM(total_duplicates) / SUM(total_received), 1)
                            ELSE 0.0 END
                FROM analytics_ingestionmetric 
                WHERE window_start >= %s;
            """, [self.day_ago])
            sql_replay_rate_24h = cursor.fetchone()[0]

            # SQL Open Incidents (OPEN only)
            cursor.execute("SELECT COUNT(*) FROM alerts_incident WHERE status = 'OPEN';")
            sql_open_count = cursor.fetchone()[0]

            # SQL Acknowledged Incidents
            cursor.execute("SELECT COUNT(*) FROM alerts_incident WHERE status = 'ACKNOWLEDGED';")
            sql_ack_count = cursor.fetchone()[0]

            # SQL Active Unresolved (OPEN + ACKNOWLEDGED)
            cursor.execute("SELECT COUNT(*) FROM alerts_incident WHERE status IN ('OPEN', 'ACKNOWLEDGED');")
            sql_active_unresolved = cursor.fetchone()[0]

            # SQL Resolved 24h count
            cursor.execute("SELECT COUNT(*) FROM alerts_incident WHERE status = 'RESOLVED' AND resolved_at >= %s;", [self.day_ago])
            sql_resolved_24h = cursor.fetchone()[0]

            # SQL MTTR for incidents resolved within 24h
            cursor.execute("""
                SELECT first_seen_at, resolved_at 
                FROM alerts_incident 
                WHERE status = 'RESOLVED' AND resolved_at >= %s;
            """, [self.day_ago])
            resolved_rows = cursor.fetchall()
            from datetime import datetime
            durations = []
            for r in resolved_rows:
                t1 = datetime.fromisoformat(r[0]) if isinstance(r[0], str) else r[0]
                t2 = datetime.fromisoformat(r[1]) if isinstance(r[1], str) else r[1]
                durations.append((t2 - t1).total_seconds() / 60.0)
            sql_mttr_24h = round(sum(durations) / len(durations), 1) if durations else 0.0

        # 2. Query Public API Overview Endpoint
        client = APIClient()
        response = client.get("/api/v1/public/overview/")
        assert response.status_code == 200
        data = response.data

        # 3. Assert Exact Parity Between API and Raw SQL
        # Deliveries:
        assert data["deliveries_24h"] == sql_deliveries_24h == 100, "API must only count 24h deliveries, excluding 48h metric"
        assert data["total_deliveries"] == sql_deliveries_total == 600, "Lifetime total must include historical metrics"

        # Replay suppression:
        assert data["replay_suppression_rate_pct"] == sql_replay_rate_24h == 20.0, "Replay rate must be 20.0% for 24h window"

        # Incident status breakdown:
        assert data["open_incidents"] == sql_open_count == 1, "open_incidents must match OPEN status count"
        assert data["acknowledged_incidents"] == sql_ack_count == 1, "acknowledged_incidents must match ACKNOWLEDGED status count"
        assert data["active_unresolved_incidents"] == sql_active_unresolved == 2, "active_unresolved must be OPEN + ACKNOWLEDGED"
        assert data["resolved_24h"] == sql_resolved_24h == 1, "resolved_24h must exclude 36h resolved incident"

        # MTTR:
        assert data["mttr_minutes"] == sql_mttr_24h == 15.0, (
            f"MTTR must be 15.0m for 24h window, excluding the 120.0m incident resolved 36h ago. Got {data['mttr_minutes']}"
        )
