# ANTIGRAVITY_AWS_DEPLOYMENT_MASTER.md

**Project:** SignalBridge\
**Purpose:** Prepare the existing local SignalBridge project for a safe,
evidence-based AWS deployment.\
**Execution mode:** Inspect first, plan second, make justified changes
third, verify fourth.\
**Critical boundary:** Do not push to GitHub or create/change AWS
resources unless the user explicitly approves that later.

## 1. Mission

Act as a careful senior software engineer, DevOps/cloud engineer,
security reviewer, and patient technical mentor. Work on the **existing
local SignalBridge project**. The local project is the source of truth
for this preparation phase; do not assume the old GitHub repository
matches it.

Prepare a genuinely deployable, appropriately scoped, cost-aware
project---not merely one that looks production-ready in documentation.

You must inspect the repository, establish the real architecture and
requirements, evaluate feasibility claims, fix justified blockers,
verify changes, prepare documentation, and report honestly. Explain
important changes so the user learns while progressing.

**Do not claim AWS deployment is complete or verified during this local
preparation phase.**

## 2. User goals and decisions

The user wants to deploy SignalBridge temporarily on AWS as a
portfolio-quality, production-style demonstration, collect real
evidence, and delete the temporary AWS resources after the
demonstration. The latest local code is newer than the existing GitHub
repository; do not push until the user reviews and approves the prepared
local version.

Services under consideration: - EC2 (user chose EC2 rather than
Lightsail) - Amazon RDS for PostgreSQL - Amazon S3 for webhook payload
archives - IAM roles and least-privilege policies - CloudWatch logs,
metrics and alarms - ECR for Docker images - GitHub Actions with OIDC
for CI/CD - Terraform for infrastructure as code - API Gateway for
managed API ingress - VPC Link and internal ALB if private API Gateway
integration is selected - Nginx for frontend/static delivery and
suitable web-server/reverse-proxy responsibilities - Redis + Celery for
asynchronous processing

This list is a proposal, not an instruction to use every service.
Evaluate value, feasibility, cost, complexity, security and portfolio
evidence. Do not add Lambda unless inspection establishes a clear need;
the existing Celery/Redis approach may already cover background work,
but verify it.

A critical open question is whether 512 MB or 1 GB RAM is enough for the
actual runtime stack. Investigate this objectively. If neither is
sufficient, recommend a realistic alternative with evidence.

## 3. Non-negotiable safety rules

### No external side effects in this phase

Do not push commits, create remote branches/PRs, modify the remote
GitHub repository, create or change AWS resources, deploy, alter
billing, run `terraform apply`/`destroy`, run AWS CLI write operations,
or execute deployment workflows.

Do not delete user data, project files, volumes or backups. Do not
overwrite uncommitted work. Do not run tests that could destroy or
mutate important data without approval.

Safe local inspection, builds and tests are allowed. Make changes only
after understanding the issue and recording the intended change.

### Secrets and sensitive data

-   Never print secret values into reports or terminal summaries.
-   Identify sensitive files by name and describe risk without copying
    their contents.
-   Check `.gitignore`, Git status and tracked files. If local Git
    history exists, inspect whether sensitive files are tracked or
    committed.
-   Treat non-placeholder secrets as potentially exposed. Recommend
    rotation if real; do not claim history cleanup unless verified.
-   Never bake AWS credentials into app settings or Docker images.
-   Prefer EC2 instance roles for app access and GitHub OIDC for CI/CD
    later.
-   Production configuration must fail clearly if required secrets are
    missing, rather than falling back to insecure defaults.
-   `.env.example` must contain placeholders only.

### Evidence integrity

Label findings as: - **Verified:** directly inspected or reproduced. -
**Reported:** stated in existing docs/user notes but not reproduced. -
**Inferred:** likely based on code/config, not measured. - **Unverified
/ blocked:** cannot be established yet; state what evidence is needed.

Never invent tests, benchmarks, prices, screenshots, AWS resources, or
successful deployments.

## 4. Discover the local project before editing

Identify the actual project root and inventory: - Top-level
files/folders. - Frontend framework, package manager, scripts, tests,
lint and build commands. - Backend framework, Python version, dependency
manager and requirements. - Dockerfiles, Compose files, Nginx
configuration and entrypoints. - Django settings modules and environment
variable handling. - Database migrations and DB dependencies. - Redis,
Celery worker and Beat configuration. - S3/archive code and storage
configuration. - Health/readiness endpoints. - Existing CI workflows. -
Terraform/infrastructure code, if present. - Backup/restore scripts and
deployment docs. - Existing tests, reports and coverage settings. -
Files/folders that should not be committed: `.env`, `.venv`,
`node_modules`, caches, build output, local databases, credentials,
dumps, logs, Terraform state and backups.

Use local Git status/history only to understand the local state. Do not
push or fetch unless approved. Do not assume remote and local match. Do
not stop to ask questions that repository inspection can answer safely.

## 5. Establish the real architecture

Inspect source and config, not just README text. Trace at least one
important webhook flow from ingress through validation, persistence,
background processing, incident/alert behavior and archival.

Verify: - Frontend API base URL and environment config. - Django
settings, allowed hosts, CORS, CSRF, trusted origins and HTTPS/proxy
behavior. - Authentication, authorization and admin access. - Webhook
HMAC/signature verification, idempotency and replay behavior where
implemented. - Request validation, error handling and rate-limit
assumptions. - Database schema, migrations, indexes, connection settings
and concurrency behavior. - Redis and Celery broker/result backend
configuration. - Celery worker/Beat commands and scheduled tasks. - S3
client creation, bucket config, object keys, retries/errors and
archive-status handling. - Health/readiness endpoints and which
dependencies they check. - Static file generation/delivery. - Logging
and possible leakage of tokens, secrets or sensitive payloads. -
Backup/restore behavior and risk of restoring to the wrong DB. - Exposed
ports, default credentials and unsafe startup assumptions.

Document discrepancies between source code, docs, Compose files and the
proposed AWS diagram.

## 6. Feasibility and claims audit --- mandatory

The user explicitly wants to know whether the plan is truly possible,
not simply be told it is easy. Create a **Feasibility and Claims
Register** containing: 1. Claim/assumption. 2. Evidence. 3. Status:
verified, plausible, false/misleading, or not verified. 4. Risk/caveat.
5. Required change or measurement. 6. Accurate final wording for
documentation/resume if relevant.

Review claims such as: - "Production-ready," "highly available,"
"secure," "zero downtime," "automated deployment," "scales
automatically." - "Costs only \$X," "free on AWS," or "credits cover
it." - "512 MB / 1 GB is sufficient." - "Tests prove concurrency
safety." - "Backup/restore works." - "All services are healthy." - "API
Gateway protects the backend." - "Infrastructure is reproducible with
Terraform."

Correct or qualify unsupported claims. Do not preserve a claim merely
because it is in current docs. Do not inflate achievements.

Important distinctions: - One EC2 instance is a single point of failure;
do not call the application highly available. - API Gateway does not
replace Django authorization or webhook signature verification. - AWS
Budget is an alert, not a hard spending cap. - Local test success does
not prove AWS networking, deployment or production behavior. - A
successful image build does not prove healthy runtime. - A service in a
diagram is not proof it is implemented. - "Production-style portfolio
deployment" is more accurate than "enterprise production-ready" unless
evidence supports the stronger claim.

## 7. EC2 RAM sizing: 512 MB vs 1 GB vs larger

This is mandatory; do not guess or choose the cheapest instance just
because it is cheap.

### Inventory the runtime

List every service expected on EC2: - Django/Gunicorn. - Celery
worker. - Celery Beat. - Redis if self-hosted. - Nginx if
containerized. - PostgreSQL only if it is kept on EC2. - S3Mock or other
local-only helpers. - Monitoring agent and OS overhead.

Identify which services are external managed AWS services (e.g. RDS and
S3) and thus do not consume EC2 container RAM. Do not include S3Mock in
AWS production if the app should use real S3.

### Measure rather than invent

-   Inspect image sizes, Python/Node build stages, worker concurrency,
    Gunicorn workers/threads and process counts.
-   Build production images locally if tooling is available.
-   Run the stack in a safe isolated environment if feasible; measure
    per-container and total memory at idle and under representative
    load.
-   Account for OS, Docker, cache, peak memory and safety margin.
-   Do not directly extrapolate from a different machine without
    caveats.
-   If Docker or tools are unavailable, say so and give the exact
    measurement plan for later. Do not claim a benchmark was performed.
-   Do not run destructive or heavy load tests without confirming
    safety.
-   Review worker counts and Gunicorn defaults; do not blindly retain
    high defaults for a tiny instance.

Assess: - **512 MB:** high-risk candidate for Django + Celery + Redis +
Nginx; approve only with evidence of acceptable memory headroom. - **1
GB:** evaluate realistically; may still be tight. - **2 GB or more:**
recommend if measured needs warrant it. - **Managed services:** compare
RAM savings from RDS/managed cache against their added costs. -
**Simplification:** consider whether all components must run
simultaneously for the demo, but do not silently remove needed
functionality.

Produce a sizing report with service inventory, measured values or an
explicit "not measured," estimated peak/headroom, minimum/preferred RAM,
trade-offs, risks and post-deployment recheck plan. Never invent
numbers. Do not claim an exact bill without region, instance type,
storage, traffic, runtime hours and pricing evidence. Use current
official AWS pricing sources if web research is available; otherwise
label estimates provisional.

## 8. Evaluate AWS architecture, do not blindly deploy everything

For EC2, RDS, S3, IAM, CloudWatch, ECR, GitHub Actions/OIDC, Terraform,
API Gateway, VPC Link/internal ALB and Nginx, document: - Which real
requirement it serves. - Whether current code supports it. - Whether it
is required for the portfolio goal or optional. - Security/operational
implications. - Cost and complexity implications. - How it will be
tested. - How it will be removed after the demo.

Principles: - Do not use public Nginx and API Gateway together without a
clear routing/security purpose. - For a private API Gateway HTTP API
integration, verify current AWS requirements for VPC Link and internal
load balancer. This adds cost and complexity. - A simpler direct Nginx
ingress may be valid for a temporary demo if API Gateway's
cost/complexity is not justified, but then do not claim API Gateway is
demonstrated. - Keep RDS private; never expose PostgreSQL publicly. -
Keep S3 private with Block Public Access. - Use EC2 instance roles
rather than static app AWS keys. - Scope app role to the specific
bucket/prefix and required operations. - Avoid NAT Gateways or other
expensive baseline services unless necessary; explain alternatives and
trade-offs. - Do not assume AWS services are free under credits/free
tier.

## 9. Production security/configuration audit

Review and fix justified issues: - Unsafe Django secret-key/database
credential defaults and missing env validation. - `DEBUG=False` in
production. - Correct `ALLOWED_HOSTS`, `CSRF_TRUSTED_ORIGINS`, CORS and
frontend API URL. - HTTPS redirects, secure cookies, HSTS, forwarded
HTTPS headers and TLS termination. Enable HSTS only after HTTPS works
correctly. - Database connection/security configuration. - S3
region/bucket/endpoint behavior for real AWS. - Boto3 credential chain:
do not require hard-coded access keys on EC2. - Bucket setup: do not
call `create_bucket()` after every `head_bucket` error; distinguish
not-found, access-denied and other errors. Prefer provisioning the
bucket separately and granting only required object access. -
Secret/token/payload redaction in logs. - Webhook signatures,
idempotency, replay protection, request size/timeouts where
appropriate. - Dependency and container tag pinning; identify floating
tags. - Container privilege, health checks, restart behavior and
graceful shutdown. - Unneeded public ports; Redis/internal app ports
must not be exposed publicly. - Migration/startup ordering. - Backup
encryption, retention, privacy and restore safety. - Least-privilege
security groups and IAM. - Admin/debug endpoints and dependency risks
where tools permit.

Do not claim a generic scan guarantees security. Document exactly what
was checked and residual risks.

## 10. Docker and deployment readiness

Inspect all Dockerfiles and Compose files. Verify: - Production images
build reproducibly. - Frontend build artifacts are served correctly. -
Django uses a production WSGI server such as Gunicorn, not the
development server. - Development-only tools/S3Mock are not accidentally
used in AWS. - Production config uses real S3 and the selected
database. - Environment variables are documented and required where
appropriate. - Health checks, restart behavior and resource-conscious
process counts are sensible. - Logs go to stdout/stderr where practical
for CloudWatch. - Volumes/persistence are intentional. - Secrets are not
baked into image layers. - Migrations run in a controlled documented
step, not concurrently in every replica. - Static assets, SPA routes,
API routes and error handling work. - Containers recover after
restart. - Image tags are traceable, ideally commit-based. - Local
development remains usable.

Do not rewrite the Compose setup without a documented reason and
preservation of local developer usability.

## 11. Testing and verification

Inspect existing tests before running them; do not blindly rerun every
test repeatedly. Run available checks: - Backend lint/type checks, unit
tests and coverage. - Frontend lint, tests and production build. -
Docker build and Compose config validation. - Django deployment checks
(including `manage.py check --deploy` with appropriate environment where
feasible). - Migration consistency. - Health/integration tests. - S3
tests with local mocks for development and a separate AWS
integration-test plan. - PostgreSQL concurrency/idempotency tests
against PostgreSQL, not only SQLite. - Backup/restore in an isolated
test DB if safe. - Secret scan and CI workflow review where tooling is
available.

For each failure, capture safe relevant output, determine whether it is
pre-existing, environmental or introduced, fix only when cause is
understood, rerun targeted checks and relevant regression checks, and
record unresolved failures. Clearly label tests not run, skipped,
blocked, or only reported by existing docs. Never claim all passed if
they did not.

## 12. GitHub preparation --- no push

Existing remote repository (user says it exists but is old):
`https://github.com/Karthik-bhandarkar/signalbridge`

The local project is newer according to the user. Do not assume remote
and local match. Do not overwrite remote or force-push.

Prepare for later review: - `.gitignore` covers `.env`, venvs,
`node_modules`, caches, build output, local DB files, logs, secrets,
dumps, Terraform state and backups. - `.env.example` contains
placeholders only. - Inspect tracked files and Git status. - If no local
Git repository exists, do not initialize/connect remote without
explaining and asking if needed. - Do not delete Git history or user
files to make the tree look clean. - Identify large/unnecessary
artifacts and recommend exclusions. - Prepare a proposed change summary
and safe commit plan. - Do not stage/commit secrets. - Do not push. The
user reviews the local result before approving publication.

## 13. Terraform and CI/CD readiness

If Terraform exists, audit it. If not, propose a minimal structure but
do not generate a large infrastructure implementation before the
architecture decision is made.

Review GitHub Actions: - Backend tests and frontend lint/tests/build. -
Coverage threshold is enforced if docs claim one. - Docker build and ECR
push. - OIDC trust policy and least-privilege deploy permissions. -
Environment separation and protected approval where appropriate. -
Secret handling. - Deployment health checks, failure behavior and
rollback limitations. - Traceable image tags. - Whether a code push
triggers CI only or deployment. - Later teardown process.

Do not create long-lived AWS access keys for CI/CD. Do not state CI/CD
is implemented until a real workflow has run successfully.

## 14. Backup, recovery and teardown

Review backup/restore scripts. Verify: - Backups aren't accidentally
committed/public. - Restore commands clearly identify target DB and warn
before overwriting. - Credentials aren't embedded in scripts. -
Instructions match the selected DB architecture. - Retention/deletion
requirements are clear. - Later cleanup inventory covers EC2, EBS
volumes/snapshots, Elastic IPs, RDS/snapshots, S3 objects/buckets, ECR
images/repositories, load balancers, VPC Links, NAT Gateways, CloudWatch
log groups/alarms, secrets and Terraform-managed resources. - Delete
only with explicit approval after evidence is saved and required data
exported.

A budget is not a hard cap. Later runbook must include a resource
inventory and cleanup verification.

## 15. Documentation to leave behind

Update existing docs rather than create duplicates. At minimum ensure
the project has: - Current architecture. - Local development/test
instructions. - Production environment-variable reference (names only,
no secret values). - Later AWS deployment prerequisites/runbook. - EC2
sizing and cost/complexity assessment. - Security findings and residual
risks. - Backup/restore instructions. - Test report distinguishing
verified, reported, skipped and blocked checks. - Evidence checklist. -
Teardown checklist. - Feasibility and Claims Register.

Keep this master instruction file as the agent's task specification, not
as a second application README.

## 16. Learning and change management

For each meaningful fix: - Explain the problem in plain language. -
Explain why the fix is needed. - Name the file(s) changed. - State
trade-offs. - Explain how it was verified. - Provide a concise learning
note.

Use small coherent changes. Avoid broad formatting-only edits,
unnecessary rewrites and tutorial-driven architecture changes. Preserve
existing naming/style unless there is a clear reason to change. Preserve
uncommitted work.

## 17. Required final report

Return a report with:

### A. Executive decision

Choose **Ready for review before GitHub push**, **Conditionally ready**
(exact blockers), or **Not ready** (critical blockers). Do not say "AWS
deployed" or "production-ready" at this stage.

### B. Repository inventory

Actual tree and discovered stack.

### C. Findings and changes

Severity, path, evidence, fix and verification for each finding.

### D. Feasibility and Claims Register

Supported, false/misleading, plausible or unverified claims.

### E. EC2 sizing decision

Actual measurements or explicit statement that no measurement was
possible. Recommend 512 MB, 1 GB or larger with rationale and headroom;
do not invent figures.

### F. Architecture recommendation

Selected minimal architecture and optional components, including API
Gateway/VPC Link/ALB, RDS, Redis, ECR, Terraform and CI/CD trade-offs.

### G. Test report

Exact commands, results, skipped checks, failures and environment
limits.

### H. Security/secret audit

Report paths and risks without revealing values; state whether tracked
and whether rotation is advised.

### I. GitHub readiness

Include/exclude list, publish safety and proposed commit plan.
Explicitly state: **No push was performed.**

### J. Blockers and next steps

Numbered sequence for user review, then GitHub push, then AWS
deployment. Identify decisions requiring approval.

### K. Evidence

List actual reports/logs created. Do not fabricate screenshots or claim
unrun checks.

## 18. Completion criteria

Complete this phase only after: - The real local project is inspected. -
Major architecture and feasibility assumptions are evaluated. - Memory
sizing is measured or explicitly unmeasured with a concrete plan. -
Security and secret risks are reviewed. - Production config and Docker
behavior are checked. - Relevant local tests/builds are run where
possible and honestly reported. - Necessary fixes are applied and
regression checks run. - Documentation matches implementation without
overclaiming. - GitHub publishing path is reviewed for
secrets/artifacts. - The user receives the final report and can approve
the next phase.

**Final rule:** Be candid and evidence-driven. If something is
difficult, expensive, infeasible under the proposed resource limits, or
not yet verified, say so and offer realistic alternatives. Do not call
the plan "easy" just to reassure the user. Do not provision AWS or push
to GitHub during this phase.
