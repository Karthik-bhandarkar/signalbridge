# SignalBridge --- Complete AWS Deployment Plan

## Master A--Z Implementation, Deployment, Evidence, and Cleanup Report

**Repository:** https://github.com/Karthik-bhandarkar/signalbridge\
**Local project (reported):**
`C:\MindForge\Project\01_SignalBridge_Webhook_Ingestion\`\
**Purpose:** One master plan for Antigravity to prepare, deploy, verify,
document, and clean up the AWS portfolio demonstration.\
**Execution rule:** Work in phases. Do not cross an approval gate
without approval. Never destroy resources until evidence is verified and
cleanup is explicitly approved.

------------------------------------------------------------------------

## 1. Executive objective

Deploy SignalBridge to real AWS infrastructure, execute the same
synthetic incident scenario locally and in AWS, collect genuine
evidence, document the architecture and results, then delete the AWS
resources created for the demonstration.

We have already spent substantial time reviewing the code and have a
previous Antigravity AWS pre-deployment assessment. Use that assessment
and the existing project as the baseline. Do not repeat the full audit
unless a specific blocker or discrepancy is found.

### Required outcomes

1.  A working application on an AWS-provided HTTPS URL; no purchased
    domain and no Vercel dependency.
2.  A clean AWS database, not populated from local data.
3.  Real webhook processing, deduplication, incident correlation,
    severity escalation, signature rejection, operator resolution, S3
    archival, and CloudWatch logging.
4.  Screenshots and test/log evidence from the actual AWS deployment.
5.  A local-vs-AWS comparison report.
6.  Updated, safe deployment documentation in GitHub.
7.  A reviewed teardown and post-cleanup inventory.

Do not claim success, security, performance, or service health until it
has been verified. Do not fabricate screenshots or substitute local
results for cloud results.

------------------------------------------------------------------------

## 2. Existing project baseline

The previous Antigravity assessment reports: - React + TypeScript + Vite
frontend. - Django 5 / Django REST Framework backend. - PostgreSQL 16. -
Redis for caching, idempotency, rate limiting, and Celery. - Celery
worker and Celery Beat. - Docker Compose and production configuration. -
Nginx and Gunicorn production serving. - HMAC-SHA256 webhook
authentication. - Idempotency and duplicate detection. - Asynchronous
webhook processing. - Incident correlation and severity escalation. -
S3-compatible payload archival; S3Mock is used locally. - Health
endpoints, tests, GitHub Actions, and deployment documentation.

The prior report stated local `main` was synchronized with
`origin/main`, the working tree was clean, and the latest reported
commit was `c339d29`. It also reported 110 backend tests passing, 3
skipped, a successful frontend build, and no Django production
deployment-check issues. These are previous reported results, not newly
verified results. Briefly verify the current Git state and rerun
relevant checks after changes.

### Previously referenced files --- verify before editing

-   `backend/apps/webhooks/views.py`
-   `backend/apps/webhooks/security.py`
-   `backend/apps/webhooks/tasks.py`
-   `backend/apps/webhooks/archival.py`
-   `backend/apps/alerts/services.py`
-   `backend/apps/monitoring/ssrf.py`
-   `backend/config/settings/production.py`
-   `backend/config/celery.py`
-   `backend/Dockerfile`
-   `frontend/`
-   `docker-compose.yml`
-   `docker-compose.prod.yml`
-   `README.md`
-   `docs/API.md`
-   `docs/ARCHITECTURE.md`
-   `docs/DEPLOYMENT.md`
-   `docs/SECURITY.md`
-   `.gitignore`
-   `local-evidence/`

Preserve existing working behavior. Extend existing files rather than
creating duplicate configurations unnecessarily.

------------------------------------------------------------------------

## 3. Target AWS architecture

Use the following target, after validating the no-custom-domain routing
and TLS design in Section 4.

  -----------------------------------------------------------------------
  Component               Target                  Responsibility
  ----------------------- ----------------------- -----------------------
  Public HTTPS entry      Amazon CloudFront       AWS-provided
                                                  `cloudfront.net`
                                                  hostname

  Traffic routing         Application Load        Routes requests to the
                          Balancer (ALB)          application host

  Application compute     EC2 + Docker Compose    Nginx, Django/Gunicorn,
                                                  Celery Worker and Beat

  Relational database     Amazon RDS for          Persistent incidents,
                          PostgreSQL              alerts, users, audit
                                                  events, webhook
                                                  metadata

  Cache and broker        Amazon ElastiCache for  Cache, idempotency,
                          Redis-compatible engine rate limiting, Celery
                                                  messaging/results

  Payload archive         Private Amazon S3       Raw webhook payload
                          bucket                  archives

  Secrets                 AWS Secrets Manager     Production secret
                                                  values

  Observability           Amazon CloudWatch       Logs, metrics, useful
                                                  alarms

  Identity                AWS IAM                 Least-privilege runtime
                                                  and deployment access

  Infrastructure          Terraform               Repeatable AWS
                                                  provisioning and
                                                  teardown

  Spending notifications  AWS Budgets, if         Budget notifications,
                          configured              not a hard spending cap
  -----------------------------------------------------------------------

Use AWS-generated hostnames. Do not add Route 53, a custom domain,
Vercel, ECS/EKS, Lambda, API Gateway, NAT Gateway, or other services
unless a technical need is established and approved. Avoid unnecessary
services, but do not reject a required service merely to minimize cost.

### Expected request flow

1.  External producer sends a signed webhook to the public HTTPS
    endpoint.
2.  CloudFront forwards the uncached request to the selected origin.
3.  ALB/Nginx routes it to Django.
4.  Django verifies the source, signature, and idempotency.
5.  The accepted payload metadata is persisted in PostgreSQL.
6.  Processing is queued after transaction commit.
7.  Celery processes the event, correlates incidents, and escalates
    severity if appropriate.
8.  The archiver stores the payload in private S3.
9.  Application and worker logs are sent to CloudWatch.
10. The operator accesses the dashboard through the public URL and
    acknowledges/resolves the incident.

Verify each stage from actual responses, database/application state,
object storage, and logs. HTTP acceptance alone does not prove
asynchronous processing completed.

------------------------------------------------------------------------

## 4. Mandatory decision: AWS hostname, TLS, and origin security

No custom domain is owned or to be purchased. The preferred public URL
is a CloudFront default hostname:

`https://<distribution-id>.cloudfront.net`

CloudFront can provide HTTPS for its own default hostname. Do **not**
assume that a public ACM certificate can be issued directly for the
default ALB DNS hostname. A public certificate normally requires control
of a domain name.

### Before provisioning, validate and document

-   Exact public hostname and request path.
-   CloudFront origin and ALB listener protocol.
-   Certificate placement and hostname validation.
-   Whether CloudFront-to-origin traffic is HTTP or HTTPS.
-   How direct ALB access is restricted.
-   Cache behavior for static assets, API, login, CSRF, health, and
    webhook routes.
-   Any security limitation or trade-off.

Evaluate these choices:

**Option A --- CloudFront HTTPS to ALB HTTP origin:**
Browser-to-CloudFront is HTTPS; origin traffic is not encrypted. If
selected, document this plainly. Restrict origin access and use an
origin secret/header plus ALB listener rules as defense in depth. Do not
claim this is equivalent to a private origin or end-to-end TLS.

**Option B --- HTTPS origin:** Use only if the origin certificate can be
validly issued for a hostname the origin actually presents and the
hostname can be validated without a custom domain. Do not assume the ALB
default hostname can be covered by a public ACM certificate.

**Option C --- Different AWS-provided HTTPS entry:** If CloudFront + ALB
cannot be configured correctly without a custom domain, propose an
AWS-supported alternative and explain the architectural trade-off. Do
not silently switch to Vercel or require a purchased domain.

**Gate:** Do not provision infrastructure until the hostname/TLS/origin
decision is technically validated and recorded.

### CloudFront routing

Prefer a single public hostname: - `/` → React static frontend. -
`/api/*` → Django API. - `/health/*` → health endpoints. -
`/api/v1/webhooks/*` → webhook endpoint.

Configure explicit behaviors. Do not cache authenticated API responses,
login/logout, CSRF responses, webhooks, or private dynamic responses.
Forward only the headers, cookies, query strings, and methods needed for
each behavior.

### Django session and CSRF

The frontend uses Django session authentication and CSRF. Verify through
the real public hostname: - `ALLOWED_HOSTS`. - `CSRF_TRUSTED_ORIGINS`. -
HTTPS/proxy headers. - Secure session and CSRF cookies. - Cookie
`SameSite` and path settings. - CloudFront forwarding of required
cookies and headers. - Login, logout, dashboard reads, acknowledgment,
and resolution.

Prefer one public hostname for frontend and API. If cross-origin routing
is unavoidable, configure and test CORS, CSRF, and cookies correctly.
Never disable CSRF or authentication to bypass a deployment problem.

------------------------------------------------------------------------

## 5. Phase 0 --- Baseline and safety checks

Before editing: 1. Confirm the project path. 2. Run `git status`; verify
branch, latest commit, and relationship to `origin/main`. 3. Confirm
`local-evidence/` is ignored and not tracked. 4. Check that `.env`,
credentials, database dumps, Terraform state, logs, build artifacts, and
local runtime data are not staged. 5. Preserve all local evidence and
the synthetic scenario. 6. Use a deployment feature branch if
appropriate; do not push it yet. 7. Record the baseline commit and
existing test results.

If the local repository has unexpected changes or has diverged from
GitHub, stop and report before editing. Do not delete or overwrite local
evidence.

**Deliverable:** short baseline report with branch, commit, worktree
state, and evidence isolation.

------------------------------------------------------------------------

## 6. Phase 1 --- Application and production configuration

Make only changes justified by the deployment. Keep local development
working.

### 6.1 Frontend

-   Use the existing production build command.
-   Confirm the output directory.
-   Serve built static assets with Nginx, not the Vite development
    server.
-   Configure SPA fallback without swallowing API paths.
-   Verify static assets, API requests, and authenticated pages.

### 6.2 Nginx

-   Serve the frontend build.
-   Route API/webhook and health paths to Django/Gunicorn.
-   Forward correct host and scheme headers.
-   Configure reasonable body limits and timeouts.
-   Avoid logging secret headers or sensitive payloads.
-   Do not expose internal service ports.
-   Validate Nginx syntax before deployment.

### 6.3 Django production settings

Verify: - `DEBUG=False`. - Secret key supplied securely. - Correct
allowed hosts and trusted origins. - Secure session and CSRF cookies. -
Correct proxy/HTTPS settings for the actual architecture. - RDS and
ElastiCache connection configuration. - Real S3 bucket configuration. -
Production logging and non-debug error responses. - Readiness semantics
accurately represent required dependencies.

### 6.4 Docker and Compose

Review `backend/Dockerfile`, frontend build, `docker-compose.prod.yml`,
and local `docker-compose.yml`. - Run Django through Gunicorn. - Keep
Celery Worker and Beat separate. - Serve the production frontend through
Nginx. - Do not expose PostgreSQL/Redis publicly. - Ensure containers
can reach RDS/ElastiCache inside the VPC. - Use sensible restart
policies and health checks. - Log to stdout/stderr or a supported
collection path. - Inject secrets at runtime; do not bake them into
images. - Keep S3Mock out of production. - Preserve local Compose
behavior.

### 6.5 Celery

Verify broker/result URLs, Redis indexes, task retries,
`transaction.on_commit` behavior, worker health, Beat scheduling, and
safe idempotent processing. Verify a task is actually processed, not
merely queued. Ensure payload archival failures are observable and
handled according to current application semantics.

### 6.6 S3 archiver

Review `backend/apps/webhooks/archival.py` and related tasks. -
Production must use the real configured bucket, never silently fall back
to S3Mock. - Use the EC2 role credential chain; no permanent keys. -
Terraform creates the bucket; application runtime should not create
it. - Grant only the necessary object permissions to the required
prefix. - Keep the bucket private and encrypted. - Verify object key
format. - Distinguish permission errors from missing objects/buckets
where applicable. - Do not log complete sensitive payloads.

### 6.7 Environment templates

Create/update a safe `.env.example` or equivalent with variable names
and placeholders only. Document Django, database, Redis/Celery, S3,
public hostname, trusted origins, logging, and secret injection. Never
commit a real `.env.production`.

------------------------------------------------------------------------

## 7. Phase 2 --- Terraform infrastructure

Adapt the existing layout if one exists. Do not create duplicate
infrastructure definitions.

Suggested structure:

``` text
terraform/
  README.md
  versions.tf
  providers.tf
  variables.tf
  outputs.tf
  networking.tf
  security_groups.tf
  iam.tf
  ec2.tf
  alb.tf
  cloudfront.tf
  rds.tf
  elasticache.tf
  s3.tf
  secrets.tf
  cloudwatch.tf
  user_data/
```

### 7.1 Provider and region

-   Choose a region deliberately.
-   Verify required service and engine availability.
-   Make region a variable.
-   Use consistent names and tags.
-   Do not hardcode account-specific IDs or credentials.

### 7.2 Networking

-   Create a VPC and subnets appropriate to the selected architecture.
-   Keep RDS and Redis in private subnets.
-   Expose only required public entry points.
-   Avoid a NAT Gateway unless needed; if required, document it and its
    cost implications.
-   Ensure routing and security groups permit only intended paths.

### 7.3 EC2

-   Use a supported Linux image.
-   Install Docker and Compose reliably.
-   Require IMDSv2.
-   Attach a least-privilege instance profile.
-   Avoid broad SSH access; prefer Systems Manager Session Manager if
    properly configured, otherwise document the approved administrative
    path.
-   Set disk size and restart behavior deliberately.
-   Do not embed secrets in user data or Terraform state.
-   Document that one EC2 host is not a highly available deployment.

### 7.4 RDS

-   Use a PostgreSQL version compatible with the application and
    available in the region.
-   `publicly_accessible=false`.
-   Private subnets; inbound only from EC2's security group.
-   Enable encryption.
-   Configure backups, retention, deletion protection, and snapshot
    behavior intentionally for a temporary demo.
-   Document how deletion protection will be handled during approved
    teardown.
-   Initialize a clean database; never restore the local database.

### 7.5 ElastiCache

-   Use a compatible Redis engine and topology.
-   Private subnets and access restricted to EC2.
-   Configure authentication/TLS where supported by the selected mode.
-   Confirm the correct URL, port, TLS, authentication, and
    database-index semantics.
-   Test from application containers.

### 7.6 S3

-   Unique bucket name.
-   Block all public access.
-   Enable encryption.
-   Enable versioning only if justified; if enabled, include versions in
    cleanup.
-   Keep local evidence out of this bucket.
-   Record the bucket name and expected prefix.

### 7.7 IAM and Secrets Manager

-   EC2 runtime role with only required S3, Secrets Manager, and
    CloudWatch permissions.
-   Do not grant broad administrator permissions to the application.
-   Keep deployment permissions separate from runtime permissions where
    practical.
-   Do not expose secret values in Terraform outputs or plans.
-   Choose and document a secure mechanism for loading secrets into
    containers.

### 7.8 ALB and CloudFront

-   Listeners and target group must match the validated TLS/origin
    design.
-   Use a working unauthenticated health endpoint.
-   Explicitly configure CloudFront methods, headers, cookies, query
    strings, and cache policies.
-   Protect the origin and document limitations.
-   Do not cache webhook or authenticated traffic.

### 7.9 CloudWatch

-   Explicit log groups and retention.
-   Collect Nginx, Django/Gunicorn, Celery, Beat, and relevant EC2 logs
    using a supported mechanism.
-   Avoid secrets and full sensitive payloads in logs.
-   Add only useful alarms whose metrics are actually available.
-   Do not claim application latency monitoring unless latency is
    instrumented and published.

### 7.10 Budgets

Configure spending notifications if appropriate. Clearly document that
AWS Budgets is not a hard spending cap and does not automatically stop
all resource usage.

### 7.11 Terraform state

-   Never commit `.tfstate`, state backups, plan files containing
    secrets, or sensitive local artifacts.
-   Choose a safe documented state approach.
-   If remote state is used, include its storage/locking resources in
    the cleanup inventory.
-   Never delete state before infrastructure ownership and cleanup are
    verified.

------------------------------------------------------------------------

## 8. Phase 3 --- Local validation before GitHub push

Before pushing: 1. Run backend tests. 2. Run frontend tests, lint, and
production build. 3. Run Django production deployment checks. 4.
Validate Docker Compose configuration. 5. Validate Nginx syntax. 6. Run
Terraform format and validation. 7. Review Terraform plan without
applying it. 8. Check migrations. 9. Review Git diff and scan for
secrets. 10. Confirm `local-evidence/` is not tracked. 11. Confirm
`.env`, database dumps, runtime logs, generated files, and Terraform
state are not staged. 12. Confirm local development still works.

Report exact counts, failures, and skipped tests. If concurrency tests
require PostgreSQL semantics but ran on SQLite, do not claim SQLite
verified advisory locks or row-level locking; run a suitable PostgreSQL
test where feasible.

### GitHub update

Only after approval: - Review the final diff. - Commit the approved
changes. - Push the approved branch/commit. - Verify the remote
commit. - Confirm no secrets, Terraform state, or local evidence were
committed.

Repository should include source, safe templates, Terraform source,
deployment scripts, tests, and documentation---not real credentials or
local runtime evidence.

------------------------------------------------------------------------

## 9. Phase 4 --- Provision AWS

Do not create resources until the code/configuration and architecture
decisions are approved.

### Preflight

-   Confirm AWS account and region.
-   Confirm authorized identity and service quotas.
-   Verify regional service/engine availability.
-   Review resources, tags, dependencies, and likely charges.
-   Confirm hostname/TLS design.
-   Confirm no unrelated resources will be modified or destroyed.
-   Review Terraform plan output.

### Provisioning

1.  Initialize Terraform.
2.  Format and validate.
3.  Create a plan.
4.  Review the plan.
5.  Apply only the approved plan.
6.  Record resource names/IDs and useful outputs.
7.  Do not print secrets.
8.  Verify resources reach healthy states.

Never run a destructive Terraform command during provisioning.

### Connectivity verification

From EC2 and actual application containers, verify: - RDS DNS and
database connection. - Redis DNS and connection. - S3 access through the
EC2 role. - Secrets Manager access. - CloudWatch log delivery. - ALB
target health. - CloudFront origin routing. - Public HTTPS behavior.

Do not make RDS or Redis public as a shortcut.

------------------------------------------------------------------------

## 10. Phase 5 --- Deploy application

1.  Pull the approved GitHub commit.
2.  Build/pull production images.
3.  Inject production configuration securely.
4.  Start production Compose services.
5.  Run Django migrations against the new RDS instance.
6.  Create an operator account through a secure documented process.
7.  Collect/serve static assets as required.
8.  Verify Nginx, Django/Gunicorn, Celery Worker, and Beat.
9.  Confirm the archiver uses the real S3 bucket.
10. Verify CloudWatch logs.

Do not put secrets in shell commands that persist in history or appear
in screenshots.

### Clean database rule

Allowed: schema migrations, necessary default configuration, a
deliberately created operator account, and minimum reference data
required by the app.

Forbidden: local database restoration, local incident records, local
alert/audit history, copied local incident IDs, or S3Mock objects.

Document how the clean database was initialized.

### Service checklist

-   Frontend loads on the public HTTPS URL.
-   API responds as expected.
-   Readiness endpoint accurately reports dependencies.
-   Database is real RDS PostgreSQL.
-   Cache/broker is real ElastiCache.
-   Celery processes a safe test task.
-   Beat is running and schedules work as expected.
-   S3 archival works.
-   CloudWatch receives actual logs.
-   Operator login and CSRF-protected operations work.
-   ALB target is healthy.
-   CloudFront routing works.
-   Public certificate is valid.
-   Database/cache ports are not public.

Capture initial health evidence before running the incident scenario.

------------------------------------------------------------------------

## 11. Phase 6 --- Run the same synthetic incident scenario

Use the existing scenario and reproduction steps as the baseline. The
prior report referenced: -
`local-evidence/synthetic-data/generate_scenario.py` -
`local-evidence/reproduction-steps/reproduce_incident.md` -
`local-evidence/test-results/scenario_execution_log.json`

Inspect the runner and its actual arguments before changing it. Make the
smallest safe change needed to target local or AWS using a base URL
variable/argument, reusing the existing convention if present.

### Scenario

Service: `payment-api`\
Fingerprint: `payment-db-pool-saturation`

**Event 1 --- Initial trigger** - HIGH severity. - Valid HMAC. -
Expected HTTP 202 Accepted. - Verify the event was persisted and
asynchronous processing completed.

**Event 2 --- Duplicate** - Re-submit the same event as defined by the
existing scenario. - Expected behavior: duplicate ignored without a
second incident/task. - The previous local report observed HTTP 200
`duplicate_ignored`; verify the current response contract.

**Event 3 --- Related escalation** - Related HTTP 504 event inside the
configured 15-minute window. - Expected: same incident updated and
severity escalated to CRITICAL. - Verify incident identity and alert
count.

**Event 4 --- Tampered signature** - Expected HTTP 401, as reported by
the local scenario. - Never reveal the HMAC secret.

**Event 5 --- Inactive source** - If present in the existing scenario,
verify the expected HTTP 403 behavior.

**Operator lifecycle** - Acknowledge. - Add root-cause notes. -
Resolve. - Verify status and audit history.

### Runner requirements

-   Same scenario and payload semantics for local and AWS.
-   Configurable base URL,
    e.g. `SIGNALBRIDGE_BASE_URL=https://<cloudfront-hostname>`, adjusted
    to the existing runner interface.
-   Correct HMAC generation for the target environment.
-   No secret values in output.
-   Record timestamps, status codes, elapsed times, sanitized response
    details, and outcomes.
-   Distinguish HTTP acceptance from completion of asynchronous
    processing.
-   Poll/use supported APIs to confirm processing completion.
-   Fail if expected outcomes do not occur.
-   Never copy local records into AWS; create new synthetic events by
    running the scenario against AWS.

Keep local and AWS evidence separate, for example:

``` text
local-evidence/
  local-run/
  aws-run/
    reports/
    screenshots/
    reproduction-steps/
    test-results/
    sanitized-logs/
```

Adapt the layout to the existing structure without overwriting existing
evidence.

------------------------------------------------------------------------

## 12. Phase 7 --- Evidence collection

All AWS evidence must come from the real deployment. Do not fabricate or
edit screenshots to imply success. Preserve originals and redact secrets
in any public copies.

### Required screenshots/results

1.  **Public application:** Browser showing the AWS HTTPS hostname and
    dashboard.
2.  **Readiness:** Actual response showing dependency health.
3.  **Webhook acceptance:** AWS endpoint, HTTP 202, measured latency.
4.  **Duplicate defense:** Duplicate response and evidence no duplicate
    incident was created.
5.  **Correlation/escalation:** Same incident, alert count,
    HIGH-to-CRITICAL escalation.
6.  **Signature defense:** Tampered request and HTTP 401.
7.  **Inactive source:** HTTP 403 if the existing scenario includes it.
8.  **Operator lifecycle:** Acknowledgment, root-cause notes,
    resolution, audit trail.
9.  **S3 archival:** Private bucket and expected synthetic object/key.
10. **CloudWatch:** Actual worker/application logs correlated with the
    run.
11. **Infrastructure:** CloudFront distribution, healthy ALB target,
    EC2, RDS, ElastiCache, S3 settings, and relevant IAM role summary.

Never expose credentials, tokens, cookies, secret values, private keys,
or unnecessary account details.

### Evidence report

Create, for example:
`local-evidence/aws-run/reports/AWS_INCIDENT_EVIDENCE_REPORT.md`

Include: - Date/time and timezone. - Deployed Git commit. - Public
URL. - AWS region. - Resource types. - Scenario version and steps. -
Expected versus observed outcomes. - HTTP codes and measured request
times. - Asynchronous processing verification. - Incident
correlation/escalation. - S3 object verification. - CloudWatch
evidence. - Screenshot index. - Failures/deviations. - Cleanup status.

Label measurements as observed. Do not claim sub-50ms/sub-100ms AWS
latency unless actual measurements support it.

### Local versus AWS comparison

Compare webhook acceptance, duplicate handling, signature rejection,
source authorization, incident correlation, escalation, operator
lifecycle, local S3Mock versus real S3, local logs versus CloudWatch,
readiness, and measured latency. Explain that network paths and
infrastructure differ; identical latency is not expected.

------------------------------------------------------------------------

## 13. Phase 8 --- Documentation and GitHub finalization

Update the README and relevant architecture/deployment documents with
the architecture that was actually deployed, not the architecture
originally intended.

Include: - Architecture diagram. - Services and responsibilities. -
Deployment workflow. - Safe configuration variable names. - Public URL
while active. - Health checks. - Incident reproduction instructions. -
Security notes and limitations. - Evidence methodology. - Cleanup
instructions.

Do not commit secrets, Terraform state, private logs, sensitive
payloads, database dumps, or `local-evidence/` if it is intended to
remain local.

Run tests, review the diff, scan for secrets, confirm ignore rules, then
commit/push only after approval. If resources are later deleted, clearly
mark the URL as retired instead of implying the application remains
live.

------------------------------------------------------------------------

## 14. Phase 9 --- Cleanup after evidence approval

**Cleanup is not automatic.** Do not destroy resources until
screenshots, logs, report, deployed commit, local/AWS comparison, and
evidence redaction have been checked and the user explicitly approves
cleanup.

### Inventory all resources created for SignalBridge

-   CloudFront distribution.
-   ALB, listeners, and target groups.
-   EC2 instance(s), EBS volumes, and snapshots.
-   RDS instances, snapshots, and retained backups.
-   ElastiCache clusters/replication groups.
-   S3 buckets, objects, and object versions.
-   Secrets Manager secrets and versions.
-   IAM roles, policies, and instance profiles.
-   CloudWatch log groups, alarms, dashboards, metric filters.
-   Security groups.
-   VPC, subnets, route tables, internet gateways, NAT gateways.
-   Elastic IP addresses.
-   Budgets.
-   Systems Manager/deployment resources created for this project.
-   Terraform remote-state/locking resources if introduced.
-   Any resource found in Terraform state or AWS inventory.

### Safe teardown procedure

1.  Save the final evidence package locally.
2.  Save the deployed commit and resource inventory.
3.  Inspect Terraform state.
4.  Create a fresh Terraform destroy plan.
5.  Review every resource scheduled for deletion.
6.  Confirm no unrelated resource is included.
7.  Handle deletion protection only for project resources and only as
    required.
8.  Empty S3 buckets, including all object versions if versioning was
    enabled.
9.  Account for RDS snapshots/backups and their potential storage
    charges.
10. Disable and wait for CloudFront distribution changes as required
    before deleting it.
11. Delete dependent resources in the required order.
12. Destroy approved Terraform-managed infrastructure.
13. Separately inspect and remove any manually created resource not
    managed by Terraform.
14. Run a post-cleanup inventory.

Never run `terraform destroy -auto-approve` without reviewing and
approving the plan.

### Post-cleanup verification

Verify that the intended EC2, EBS, RDS, ElastiCache, S3, CloudFront,
ALB, Elastic IP, NAT Gateway, logs, secrets, and networking resources
are removed. Document any resource that must remain and why. Do not
claim cleanup is complete until inventory confirms it.

AWS Budgets alerts are not a hard cap. Retained snapshots, backups,
logs, or other leftovers can continue to incur charges.

------------------------------------------------------------------------

## 15. Security requirements

1.  Never commit credentials or real secrets.
2.  Keep RDS and Redis private.
3.  Use least-privilege IAM.
4.  Require IMDSv2.
5.  Keep S3 private and encrypted.
6.  Do not use permanent AWS keys in production.
7.  Keep Django `DEBUG=False`.
8.  Preserve authentication, HMAC validation, and CSRF protections.
9.  Restrict administrative access.
10. Avoid logging secrets, cookies, authorization headers, or sensitive
    payloads.
11. Do not open database/cache ports to the public internet.
12. Do not expose Docker daemon ports.
13. Do not put secrets in user data, images, Terraform outputs, or Git
    history.
14. Keep local incident evidence out of GitHub and AWS storage.
15. Report security limitations honestly.

------------------------------------------------------------------------

## 16. Troubleshooting rules

Diagnose from the actual error and relevant sanitized logs; do not
repeatedly change unrelated settings.

-   **Container startup:** Inspect status/logs, environment variable
    presence (not values), migrations, DB reachability, and production
    settings.
-   **Unhealthy ALB target:** Check health path, host/container ports,
    Nginx routes, security groups, and health endpoint behavior.
-   **CloudFront errors:** Check behavior, origin, protocol/certificate,
    forwarded headers, target health, and path routing.
-   **Django 400:** Check `ALLOWED_HOSTS` and forwarded host.
-   **Login/CSRF failures:** Check cookies, trusted origins, forwarded
    HTTPS, and CloudFront forwarding; never disable CSRF.
-   **RDS failure:** Check private routing, DNS, port, credentials,
    database name, and security groups; do not make RDS public.
-   **Redis/Celery failure:** Check endpoint, TLS, auth, URL encoding,
    broker configuration, and worker logs.
-   **S3 failure:** Check bucket, region, role, IAM policy, key, and
    error type; do not grant unrestricted S3 permissions.
-   **Secrets failure:** Check role permission, secret ARN/region, and
    expected secret format without printing values.

For each blocker, report exact error, relevant file/resource, sanitized
evidence, likely cause, and next diagnostic step.

------------------------------------------------------------------------

## 17. Approval gates and execution order

### Gate 1 --- Local preparation

Implement necessary code/configuration changes and test locally. Do not
push or create AWS resources. Report changed files, test results, diff
summary, blockers, and deployment commands. Stop for review.

### Gate 2 --- GitHub update

After approval, commit/push the reviewed changes and verify the remote
commit. Stop if secret scanning or repository checks fail.

### Gate 3 --- Infrastructure plan

Validate Terraform and review the full plan, region, resources, network
design, hostname/TLS decision, and likely charges. Do not apply until
approved.

### Gate 4 --- Provisioning

Create approved infrastructure and record resource inventory.

### Gate 5 --- Deployment

Deploy the approved commit, configure secrets, run migrations, and
verify health.

### Gate 6 --- Incident scenario

Run the scenario against AWS and verify asynchronous processing,
incident state, S3, and CloudWatch.

### Gate 7 --- Evidence review

Produce the report and compare local/AWS results. Stop for approval
before cleanup.

### Gate 8 --- Cleanup

Review destroy plan, delete approved resources, and verify the
post-cleanup inventory.

Do not automatically continue through approval gates.

------------------------------------------------------------------------

## 18. Required phase report

At the end of each phase, provide: - Phase completed. - Files changed
with paths. - AWS resources created/modified, if any. - Commands and
checks run. - Actual test results, including skipped tests. - Evidence
captured. - Remaining blockers and risks. - Next action. - Whether
approval is required.

Separate verified facts from assumptions. Do not state "complete,"
"secure," "healthy," or "deployed" without the relevant check.

------------------------------------------------------------------------

## 19. Definition of done

### Code/repository

-   [ ] Production configuration is ready and tested.
-   [ ] Tests and checks pass or exceptions are documented.
-   [ ] No secrets or local evidence are committed.
-   [ ] Approved source is pushed to GitHub.
-   [ ] Deployment instructions are reproducible.

### AWS

-   [ ] AWS-provided public HTTPS URL works.
-   [ ] TLS and origin limitations are documented accurately.
-   [ ] ALB target is healthy.
-   [ ] EC2 containers run.
-   [ ] RDS and ElastiCache are private and connected.
-   [ ] S3 is private and archival works.
-   [ ] Secrets are injected securely.
-   [ ] CloudWatch receives actual logs.
-   [ ] Database/cache are not publicly exposed.

### Scenario

-   [ ] Valid webhook accepted.
-   [ ] Duplicate ignored.
-   [ ] Related event correlated to the same incident.
-   [ ] Severity escalation verified.
-   [ ] Tampered signature rejected.
-   [ ] Inactive source rejected if included.
-   [ ] Operator acknowledgment and resolution verified.
-   [ ] S3 object exists.
-   [ ] Asynchronous processing independently verified.

### Evidence/cleanup

-   [ ] Genuine screenshots and logs saved.
-   [ ] Local/AWS comparison report exists.
-   [ ] Deployed commit recorded.
-   [ ] Evidence contains no secrets.
-   [ ] Cleanup approved.
-   [ ] Destroy plan reviewed.
-   [ ] Intended resources removed.
-   [ ] Leftover volumes, snapshots, object versions, logs, IPs, and
    networking resources checked.
-   [ ] Final cleanup inventory saved.

------------------------------------------------------------------------

## 20. Final instruction to Antigravity

Treat this document as the single master plan. Begin at Gate 1. Reuse
the completed assessment and existing code as the baseline; do not
repeat the full audit.

Resolve the AWS-generated hostname, TLS, routing, and origin-security
design before provisioning. Implement and test the necessary local
changes first. Stop and report for review before pushing code or
creating AWS resources.

The objective is a real, reproducible AWS portfolio demonstration with
honest evidence---not just an architecture diagram or a simulated
deployment.
