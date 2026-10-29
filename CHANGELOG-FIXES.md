# SignalBridge — Fixes & Hardening Changelog (`CHANGELOG-FIXES.md`)

> **Live Deployment Target**: `https://d1soslo0efb36p.cloudfront.net`  
> **Working Branch**: `fix/production-ready`  
> **Rule**: Every defect gets an entry with Symptom, Root Cause, Fix, and Test Verification.

---

## Work Package Index
- [WP1: Baseline & Safety](#wp1-baseline--safety)
- [WP2: Auth Rebuild](#wp2-auth-rebuild)
- [WP3: Live Event Stream (SSE)](#wp3-live-event-stream-sse)
- [WP4: Data Layer Cleanup (Remove Drizzle/pg)](#wp4-data-layer-cleanup)
- [WP5: Buttons, Links & Trailing Slashes](#wp5-buttons-links--trailing-slashes)
- [WP6: Metric Correctness](#wp6-metric-correctness)
- [WP7: Infrastructure & Origin Lock](#wp7-infrastructure--origin-lock)
- [WP8: Security & Repo Hygiene](#wp8-security--repo-hygiene)
- [WP9: Autonomous Bug Hunt Findings](#wp9-autonomous-bug-hunt-findings)
- [WP10: End-to-End Test Suite](#wp10-end-to-end-test-suite)
- [WP11: Deployment & Live Verification](#wp11-deployment--live-verification)
- [WP12: Demo Readiness & Demo Assets](#wp12-demo-readiness--demo-assets)

---

## WP1: Baseline & Safety
- **Baseline Test Suite**: Pytest 74 passed, 2 skipped.
- **Baseline Frontend Build**: Typecheck clean (0 errors), Lint 0 errors (2 warnings in `LiveDashboard.tsx`), Turbopack standalone build succeeded in 9.7s.
- **Added Endpoint**: `GET /api/v1/version/` returning `{ "git_commit": "<sha>", "build_time": "<iso>", "environment": "production" }` to identify live release version on EC2.

---
