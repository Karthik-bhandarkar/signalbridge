"""
===================================================================================
SignalBridge Webhook Ingestion Engine — HMAC Cryptographic Security Layer
===================================================================================
PURPOSE:
    This module implements cryptographic request authentication for incoming webhooks
    using Hash-based Message Authentication Codes (HMAC) with the SHA-256 hash algorithm.

ARCHITECTURAL PRINCIPLES:
    1. Payload Integrity & Authenticity: Ensures that the webhook genuinely originated
       from our trusted alert provider (authenticity) and was not intercepted, altered,
       or forged in transit (integrity).
    2. Constant-Time Comparison (Timing Attack Protection):
       Standard Python equality comparison ('sig_a == sig_b') returns False on the
       very first mismatched character. Attackers can measure network latency differences
       (in nanoseconds) to deduce valid characters one by one.
       Using 'hmac.compare_digest()' forces comparison of the entire string in constant
       clock cycles, mathematically neutralizing timing side-channel attacks.
    3. Flexible Header Formats:
       Different vendors format their signature headers differently:
         - GitHub: 'sha256=<hex_digest>'
         - PagerDuty: raw '<hex_digest>' or 'v1=<hex_digest>'
         - Datadog: raw '<hex_digest>'
       Our parser handles both raw hex strings and prefixed formats.
===================================================================================
"""
# Python Standard Library Cryptographic Modules:
import hmac
import hashlib


def verify_hmac_signature(raw_body: bytes, secret_key: str, header_value: str | None) -> tuple[bool, str]:
    """
    Cryptographically verifies an incoming webhook payload using HMAC-SHA256.

    Parameters:
        raw_body (bytes): The raw, unparsed HTTP request body bytes directly from the network socket.
        secret_key (str): The shared secret key configured for the WebhookSource.
        header_value (str | None): The value received in 'X-Signature-256' or 'X-Signature-SHA256'.

    Returns:
        tuple[bool, str]: (is_valid, error_reason)
            - True, "" if the signature is authentic and verified.
            - False, reason message if missing, malformed, or mismatched.
    """
    # -----------------------------------------------------------------------------
    # 1. VALIDATE PRESENCE OF SIGNATURE HEADER
    # -----------------------------------------------------------------------------
    if not header_value:
        return False, "Missing HMAC signature header (expected 'X-Signature-256' or 'X-Signature-SHA256')."

    # -----------------------------------------------------------------------------
    # 2. EXTRACT HEXADECIMAL DIGEST (HANDLE PREFIXES)
    # -----------------------------------------------------------------------------
    # Vendors like GitHub/Shopify prefix their digest with the algorithm name (e.g., 'sha256=abcdef...').
    # Strip whitespace and split on '=' if a prefix exists:
    provided_signature = header_value.strip()
    if "=" in provided_signature:
        algorithm, _, provided_signature = provided_signature.partition("=")
        # If the prefix was not sha256 or v1, log it but compare the digest
        if algorithm.lower() not in ("sha256", "v1", "hmac-sha256"):
            return False, f"Unsupported HMAC algorithm prefix '{algorithm}'. Expected 'sha256'."

    # -----------------------------------------------------------------------------
    # 3. COMPUTE EXPECTED HMAC-SHA256 DIGEST FROM RAW BYTES
    # -----------------------------------------------------------------------------
    # - key: secret_key encoded to UTF-8 bytes
    # - msg: raw HTTP request body bytes (MUST NOT be decoded or re-serialized)
    # - digestmod: hashlib.sha256
    computed_mac = hmac.new(
        key=secret_key.encode("utf-8"),
        msg=raw_body,
        digestmod=hashlib.sha256,
    )
    expected_signature = computed_mac.hexdigest()

    # -----------------------------------------------------------------------------
    # 4. CONSTANT-TIME TIMING-SAFE COMPARISON
    # -----------------------------------------------------------------------------
    # 'compare_digest' guarantees O(1) comparison time regardless of where mismatches occur,
    # preventing timing side-channel attacks.
    is_valid = hmac.compare_digest(expected_signature, provided_signature)

    if not is_valid:
        return False, "HMAC signature mismatch. The payload has been tampered with or secret is invalid."

    return True, ""
