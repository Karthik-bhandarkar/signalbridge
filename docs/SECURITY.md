# SignalBridge Security Architecture & Threat Model

> **Status:** Production-Ready Hardened  
> **Security Directives:** Zero hardcoded credentials, strict boundary separation between external webhook ingestion and operator controls, active SSRF defense, and constant-time cryptographic verification.

---

## 1. Authentication Surface Separation

SignalBridge enforces strict architectural isolation between external webhooks and operator administration:

```
┌─────────────────────────────────┐       ┌─────────────────────────────────┐
│     External Webhook Clients    │       │     Internal Incident Operators │
└────────────────┬────────────────┘       └────────────────┬────────────────┘
                 │                                         │
        HMAC-SHA256 Signatures                   Session Cookie + CSRF
                 │                                         │
                 ▼                                         ▼
┌─────────────────────────────────┐       ┌─────────────────────────────────┐
│  /api/v1/webhooks/{source_slug} │       │      /api/v1/incidents/ ...     │
│   (No Session / No Cookies)     │       │   (IsAuthenticated Permission)  │
└─────────────────────────────────┘       └─────────────────────────────────┘
```

1. **Webhook Ingestion (`/api/v1/webhooks/`):**
   - Unauthenticated callers are rejected before parsing JSON bodies.
   - Evaluates `X-Signature-SHA256` or `X-Hub-Signature-256`.
   - Never inspects or relies upon session cookies or operator tokens.
2. **Operator API (`/api/v1/incidents/`, `/api/v1/services/`, etc.):**
   - Requires active Django session (`sessionid`).
   - Requires valid `X-CSRFToken` header matching the session CSRF secret.
   - Rejects unauthenticated requests with `401 Unauthorized`.

---

## 2. Constant-Time Cryptographic Verification

A standard string equality comparison (`sig1 == sig2`) terminates as soon as the first non-matching byte is encountered, allowing attackers to measure microscopic timing variations to reconstruct HMAC signatures byte-by-byte.

### Implementation in SignalBridge
Implemented in `apps.core.security`:
```python
def verify_hmac_sha256(raw_payload: bytes, secret_key: str, signature_header: str) -> bool:
    expected = hmac.new(
        key=secret_key.encode("utf-8"),
        msg=raw_payload,
        digestmod=hashlib.sha256
    ).hexdigest()
    # hmac.compare_digest executes in constant time regardless of where mismatches occur
    return hmac.compare_digest(expected, signature_header)
```

---

## 3. Server-Side Request Forgery (SSRF) Protection

When synthetic monitoring checks target external URLs provided by operators, a malicious or compromised operator could configure a target URL pointing to internal infrastructure:
- Cloud metadata endpoints: `http://169.254.169.254/latest/meta-data/iam/`
- Localhost services: `http://127.0.0.1:6379/` (Redis), `http://127.0.0.1:5432/` (PostgreSQL)
- Internal VPC subnets: `http://10.0.1.5/admin/`

### The SignalBridge SSRF Filter
Implemented in `apps.monitoring.ssrf.SSRFValidator`:
1. **Scheme Validation:** Only `http` and `https` schemes are accepted (`file://`, `gopher://`, `ftp://` rejected).
2. **DNS Resolution & IP Analysis:**
   - Resolves the hostname to an IP address using `socket.getaddrinfo`.
   - Rejects loopback addresses (`127.0.0.0/8`, `::1`).
   - Rejects link-local and cloud metadata addresses (`169.254.0.0/16`).
   - Rejects private RFC 1918 subnets (`10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`).
3. **Pinning Connection Target:** The synthetic monitor check requests only verified IP addresses, mitigating DNS rebinding attacks.

---

## 4. Secret Lifecycle & Key Rotation

- Webhook secret keys are generated using cryptographically secure entropy: `secrets.token_hex(32)`.
- **Zero-Downtime Secret Rotation:** Operators can rotate keys via `POST /api/v1/integrations/{slug}/rotate-secret/`. The endpoint generates a new 256-bit secret, logs an audit entry, and immediately invalidates the retired key.

---

## 5. Production Hardening Headers

Configured in `config/settings/production.py`:
- `SECURE_SSL_REDIRECT = True`: Enforces HTTPS on all endpoints.
- `SESSION_COOKIE_SECURE = True`: Session cookies only transmitted over TLS.
- `CSRF_COOKIE_SECURE = True`: CSRF cookies only transmitted over TLS.
- `SESSION_COOKIE_HTTPONLY = True`: Blocks JavaScript access to session tokens.
- `SECURE_HSTS_SECONDS = 31536000`: Enforces HTTP Strict Transport Security for 1 year with preload and subdomains.
- `SECURE_BROWSER_XSS_FILTER = True`: Activates browser XSS filters.
- `X_FRAME_OPTIONS = "DENY"`: Prohibits clickjacking within iframes.
- `SECURE_CONTENT_TYPE_NOSNIFF = True`: Prevents MIME-type sniffing.

---

## 6. Secret Hygiene & Repository Auditing

- **No Secrets in Version Control:** The `.gitignore` excludes `.env`, `*.sqlite3`, and `local_settings.py`.
- **Placeholder Templates:** Environment variables are documented in `.env.example` with non-secret defaults (`CHANGE_ME_IN_PRODUCTION`).
