# SignalBridge Telemetry & Operational Metrics Reference

This document provides the definitive specifications, database query definitions, aggregation windows, and display components for all metrics rendered across the SignalBridge operator dashboard and marketing views.

---

## 1. Metric Catalog

### 1. Deliveries · 24h
- **Card Title**: `DELIVERIES · 24H`
- **Frontend Component**: `frontend/src/app/dashboard/LiveDashboard.tsx` (`OverviewKPIs.deliveries_24h`)
- **Backend Endpoint**: `GET /api/v1/public/overview/`
- **Time Window**: Rolling 24-hour window (`created_at >= timezone.now() - timedelta(hours=24)`)
- **Formula**:
  $$\text{Deliveries (24h)} = \text{Count}(\text{IngestedPayloads where } \text{created\_at} \ge \text{now} - 24\text{h})$$
- **Database Query**:
  ```python
  IngestedPayload.objects.filter(created_at__gte=timezone.now() - timedelta(hours=24)).count()
  ```
- **Expected Seed Value**: $\ge 8$ events.

---

### 2. Total Deliveries (Lifetime)
- **Card Subtitle**: `total lifetime deliveries`
- **Frontend Component**: `frontend/src/app/dashboard/LiveDashboard.tsx` (`OverviewKPIs.total_deliveries`)
- **Backend Endpoint**: `GET /api/v1/public/overview/`
- **Time Window**: Lifetime (all-time since cluster inception)
- **Database Query**:
  ```python
  IngestedPayload.objects.count()
  ```

---

### 3. Open Incidents
- **Card Title**: `OPEN INCIDENTS`
- **Frontend Component**: `frontend/src/app/dashboard/LiveDashboard.tsx` (`OverviewKPIs.open_incidents`, `OverviewKPIs.critical_open`)
- **Backend Endpoint**: `GET /api/v1/public/overview/` (honors `?include_simulated=true|false`)
- **Time Window**: Present active state
- **Formula**:
  $$\text{Open Incidents} = \text{Count}(\text{Incidents where status} = \text{"OPEN"})$$
  $$\text{Critical Open} = \text{Count}(\text{Incidents where status} = \text{"OPEN" and severity} = \text{"CRITICAL"})$$
- **Database Query**:
  ```python
  Incident.objects.filter(status=Incident.IncidentStatus.OPEN).count()
  Incident.objects.filter(status=Incident.IncidentStatus.OPEN, severity=Incident.SeverityLevel.CRITICAL).count()
  ```
- **Severity Badge Rule**: Card border flashes red with `CRITICAL` pill when `critical_open > 0`.

---

### 4. Replays Suppressed Rate
- **Card Title**: `REPLAYS SUPPRESSED`
- **Frontend Component**: `frontend/src/app/dashboard/LiveDashboard.tsx` (`OverviewKPIs.replay_suppression_rate_pct`)
- **Backend Endpoint**: `GET /api/v1/public/overview/`
- **Time Window**: Rolling 24-hour aggregation (aligned with 24h delivery window)
- **Formula**:
  $$\text{Replay Suppression Rate (\%)} = \frac{\text{Duplicates Blocked}}{\text{Total Received}} \times 100$$
- **Database Logic**:
  Aggregates `total_received` and `total_duplicates` from `IngestionMetric` across the 24h window:
  ```python
  metric_agg_24h = IngestionMetric.objects.filter(window_start__gte=day_ago).aggregate(
      rec=Sum("total_received"),
      dup=Sum("total_duplicates")
  )
  ```
  If no minute buckets are stored for the last 24h, falls back to raw deduplication events:
  ```python
  dup_payloads = IngestedPayload.objects.filter(created_at__gte=day_ago, error_message__icontains="duplicate").count()
  rate = round((dup_payloads / (deliveries_24h + dup_payloads)) * 100.0, 1)
  ```

---

### 5. Mean Time to Resolution (MTTR)
- **Card Title**: `MEAN RESOLUTION (MTTR)`
- **Frontend Component**: `frontend/src/app/dashboard/LiveDashboard.tsx` (`OverviewKPIs.mttr_minutes`)
- **Backend Endpoint**: `GET /api/v1/public/overview/`
- **Time Window**: Computed from all resolved incidents
- **Formula**:
  $$\text{MTTR (minutes)} = \frac{1}{N} \sum_{i=1}^{N} \frac{\text{resolved\_at}_i - \text{first\_seen\_at}_i}{60}$$
- **Database Query**:
  ```python
  resolved_incidents = Incident.objects.filter(status="RESOLVED", resolved_at__isnull=False)
  durations = [(inc.resolved_at - inc.first_seen_at).total_seconds() / 60.0 for inc in resolved_incidents]
  mttr = round(sum(durations) / len(durations), 1) if durations else 0.0
  ```
- **Simulation Isolation**: When `?include_simulated=false` is queried, simulated incidents are excluded so instantaneous synthetic test runs do not skew the organic MTTR.

---

### 6. Mean Time to Acknowledge (MTTA)
- **Frontend Component**: `LiveDashboard.tsx` / `public_views.py`
- **Backend Endpoint**: `GET /api/v1/public/overview/`
- **Formula**:
  $$\text{MTTA (minutes)} = \frac{1}{M} \sum_{j=1}^{M} \frac{\text{acknowledged\_at}_j - \text{first\_seen\_at}_j}{60}$$
- **Database Query**:
  ```python
  acknowledged_incidents = Incident.objects.filter(acknowledged_at__isnull=False)
  durations = [(inc.acknowledged_at - inc.first_seen_at).total_seconds() / 60.0 for inc in acknowledged_incidents]
  mtta = round(sum(durations) / len(durations), 1) if durations else 0.0
  ```

---

### 7. Correlation Ratio
- **Backend Endpoint**: `GET /api/v1/public/overview/`
- **Formula**:
  $$\text{Correlation Ratio} = \frac{\text{Total Raw Alerts}}{\max(1, \text{Total Correlated Incidents})}$$
- **Database Query**:
  ```python
  Alert.objects.count() / max(1, Incident.objects.count())
  ```
- **Interpretation**: Indicates the alert reduction multiplier (e.g. 2.0x means every 2 raw upstream alert signals are deduplicated and bundled into 1 actionable incident).

