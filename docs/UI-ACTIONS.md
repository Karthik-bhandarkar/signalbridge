# SignalBridge UI Actions & Interaction Map

Every interactive element in the SignalBridge operator and observer console, documented with handler logic, network egress, authentication requirement, failure modes, and verification state.

| Surface / Page | Control Label / Key | Component | Handler Function | Network Call | Auth Required | Failure / Fallback State | Live Verified |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Global Shell** | Brand Logo | `Shell.tsx` | Next `Link` | Client navigation to `/dashboard` | No | None | YES |
| **Global Shell** | Workspace Selector | `Shell.tsx` | Static badge | None | No | None | YES |
| **Global Shell** | Overview Nav Item | `Shell.tsx` | Next `Link` | Client navigation to `/dashboard` | No | None | YES |
| **Global Shell** | Incidents Nav Item | `Shell.tsx` | Next `Link` | Client navigation to `/dashboard/incidents` | No | None | YES |
| **Global Shell** | Alerts Nav Item | `Shell.tsx` | Next `Link` | Client navigation to `/dashboard/events` | No | None | YES |
| **Global Shell** | System Health Nav Item | `Shell.tsx` | Next `Link` | Client navigation to `/dashboard/system` | No | None | YES |
| **Global Shell** | Public Status Page | `Shell.tsx` | Next `Link` | Client navigation to `/docs#status` | No | None | YES |
| **Global Shell** | API Documentation | `Shell.tsx` | Next `Link` | Client navigation to `/docs` | No | None | YES |
| **Global Shell** | Quick Search Input | `Shell.tsx` | Form GET | Navigation to `/dashboard/incidents?q=...` | No | Retains query param in incident table filter | YES |
| **Global Shell** | Quick Search Trigger (`/` key) | `Shell.tsx` | `keydown` listener | None | No | Focuses search input | YES |
| **Global Shell** | Refresh Workspace | `Shell.tsx` | `startTransition(router.refresh)` | Soft page state revalidation | No | Spin indicator completes | YES |
| **Global Shell** | Sign In as Operator | `Shell.tsx` | `openLoginModal()` | Opens `OperatorLoginModal` | No | Modal opens | YES |
| **Global Shell** | Sign Out | `Shell.tsx` | `auth.logout()` | `POST /api/v1/auth/logout/` | Yes | Cross-tab broadcast resets state to Public Observer | YES |
| **Overview** | Sign In as Operator (Header) | `LiveDashboard.tsx` | `openLoginModal()` | Opens `OperatorLoginModal` | No | Modal opens | YES |
| **Overview** | Telemetry Stream Beacon | `LiveTelemetryBeacon.tsx` | `useLiveStream` / polling | `GET /api/v1/stream/` (fallback `GET /api/health/`) | No | Reconnect indicator; fallback to 3.5s poll | YES |
| **Overview** | Refresh Stream Data | `LiveDashboard.tsx` | `refreshAll()` | `GET /api/v1/public/overview/` & `/api/v1/public/incidents/` | No | Revalidates KPIs & incident table | YES |
| **Overview** | Incident Filter Search | `LiveDashboard.tsx` | `setSearch(e.target.value)` | None (instant client-side filter) | No | "No open incidents matching filter" banner | YES |
| **Overview** | Include Simulated Checkbox | `LiveDashboard.tsx` | `setIncludeSimulated(checked)` | `GET /api/v1/public/incidents/?include_simulated=...` | No | Re-fetches with simulated query param | YES |
| **Overview** | Incident Row Click | `LiveDashboard.tsx` | `openIncidentDetail(inc)` | `GET /api/v1/public/incidents/<id>/` | No | Opens drawer with complete incident & alert signals | YES |
| **Overview** | Quick Ack Button | `LiveDashboard.tsx` | `handleAcknowledge(id)` | `POST /api/v1/incidents/<id>/acknowledge/` | Operator | Optimistic ACK, prompts login modal if unauthed | YES |
| **Overview** | Quick Resolve Button | `LiveDashboard.tsx` | `handleResolve(id, notes)` | `POST /api/v1/incidents/<id>/resolve/` | Operator | Optimistic RESOLVED, prompts login modal if unauthed | YES |
| **Simulator Studio** | Scenario Radio Selection | `SimulatorStudio.tsx` | `setSelectedScenario(id)` | None | No | Updates scenario context & latency estimates | YES |
| **Simulator Studio** | Dispatch Live Webhook | `SimulatorStudio.tsx` | `handleDispatch()` | `POST /api/v1/simulator/dispatch/` | Operator | Triggers 401 login modal if unauthenticated; displays 200 payload & updates incident stream | YES |
| **Incidents Board** | Board / Table Toggle | `IncidentSectionsBoard.tsx` | `setViewMode(mode)` | None (switches layout render) | No | Renders 3-lane kanban board or full table | YES |
| **Incidents Board** | Filter by Service / Title | `IncidentSectionsBoard.tsx` | `setSearch(value)` | None (instant client-side filter) | No | Filters cards across all lanes | YES |
| **Incidents Board** | Severity Filter Dropdown | `IncidentSectionsBoard.tsx` | `setSeverityFilter(sev)` | None (instant client-side filter) | No | Filters cards by CRITICAL, HIGH, etc. | YES |
| **Incidents Board** | Service Filter Dropdown | `IncidentSectionsBoard.tsx` | `setServiceFilter(srv)` | None (instant client-side filter) | No | Filters cards by service name | YES |
| **Incidents Board** | Show Simulated Checkbox | `IncidentSectionsBoard.tsx` | `setShowSimulated(checked)` | `GET /api/v1/public/incidents/?include_simulated=...` | No | Re-fetches incident list | YES |
| **Incidents Board** | Acknowledge -> Card Button | `IncidentSectionsBoard.tsx` | `onAcknowledge(id)` | `POST /api/v1/incidents/<id>/acknowledge/` | Operator | Moves card from Present to In-Progress lane | YES |
| **Incidents Board** | Resolve Incident Card Button | `IncidentSectionsBoard.tsx` | `onResolve(id, notes)` | `POST /api/v1/incidents/<id>/resolve/` | Operator | Moves card from In-Progress to Resolved lane | YES |
| **Incidents Board** | Incident Card Click | `IncidentSectionsBoard.tsx` | `onSelectIncident(inc)` | `GET /api/v1/public/incidents/<id>/` | No | Opens drawer with complete timeline | YES |
| **Alerts Ingestion Log**| Severity Pill Filters | `EventsClientPage.tsx` | `setSeverity(sev)` | None (instant client-side filter) | No | Filters raw deliveries table | YES |
| **Alerts Ingestion Log**| Status Pill Filters | `EventsClientPage.tsx` | `setStatus(stat)` | None (instant client-side filter) | No | Filters by all, processed, duplicate | YES |
| **Alerts Ingestion Log**| Raw Payload Inspect | `EventsClientPage.tsx` | `setSelectedPayload(json)` | None | No | Opens JSON payload previewer modal | YES |
| **System Health** | Replay Traffic Button | `SystemClientPage.tsx` | `handleReplayTraffic()` | `POST /api/v1/simulator/dispatch/` | Operator | Injects replay burst | YES |
| **System Health** | Manual Refresh Button | `SystemClientPage.tsx` | `fetchHealth()` | `GET /api/health/` & `GET /api/v1/public/overview/` | No | Refreshes backend component diagnostics | YES |
| **Incident Detail Drawer**| Close Button / Backdrop | `IncidentDetailDrawer.tsx` | `onClose()` | None | No | Drawer unmounts | YES |
| **Incident Detail Drawer**| Drawer Acknowledge Button| `IncidentDetailDrawer.tsx` | `onAcknowledge(id)` | `POST /api/v1/incidents/<id>/acknowledge/` | Operator | Updates status to ACKNOWLEDGED in drawer and feed | YES |
| **Incident Detail Drawer**| Drawer Resolve Button | `IncidentDetailDrawer.tsx` | `onResolve(id, notes)` | `POST /api/v1/incidents/<id>/resolve/` | Operator | Prompts resolution notes & updates status to RESOLVED | YES |
| **Operator Login Modal**| Demo Operator Quick Fill | `LoginForm.tsx` | Quick fill credentials | Sets form fields to `demo.operator` | No | Fills form ready for 1-click submit | YES |
| **Operator Login Modal**| Demo Viewer Quick Fill | `LoginForm.tsx` | Quick fill credentials | Sets form fields to `demo.viewer` | No | Fills form ready for 1-click submit | YES |
| **Operator Login Modal**| Show / Hide Passkey | `LoginForm.tsx` | `setShowPassword(!show)` | None | No | Toggles input type between password and text | YES |
| **Operator Login Modal**| Sign In Form Submit | `LoginForm.tsx` | `apiClient.auth.login(u, p)`| `POST /api/v1/auth/login/` | No | Sets `sessionid` and `csrftoken`, closes modal, updates all dashboard components | YES |

