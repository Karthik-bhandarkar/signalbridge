"""
===================================================================================
SignalBridge — Server-Side Request Forgery (SSRF) Protection Filter
===================================================================================
PURPOSE:
    Active synthetic health monitors send outbound HTTP requests to user-configured
    target URLs. Without rigorous validation, malicious actors or compromised internal
    users could exploit synthetic monitors to:
      1. Probe internal private subnets (10.0.0.0/8, 192.168.0.0/16, 172.16.0.0/12).
      2. Access cloud instance metadata services (e.g. AWS IMDSv1/v2 at 169.254.169.254)
         to steal IAM credentials and security tokens.
      3. Target localhost / loopback services (127.0.0.1, ::1) to tamper with Redis,
         PostgreSQL, or local admin ports.
      4. Execute DNS Rebinding attacks by responding with a public IP on initial
         validation, then resolving to a private IP during HTTP fetch.
===================================================================================
"""
import ipaddress
import logging
import socket
from typing import Optional, Tuple
from urllib.parse import urlparse

logger = logging.getLogger(__name__)

# Cloud provider instance metadata service IP (AWS, GCP, Azure, OpenStack):
CLOUD_METADATA_IPS = {
    ipaddress.ip_network("169.254.0.0/16"),
    ipaddress.ip_network("fe80::/10"),
}


def is_ip_blocked(ip_obj: ipaddress.IPv4Address | ipaddress.IPv6Address, allow_private_ips: bool = False) -> Tuple[bool, str]:
    """
    Evaluates whether an IP address should be prohibited from outbound probes.
    """
    # 1. Loopback addresses (127.0.0.1, ::1):
    if ip_obj.is_loopback:
        return True, f"Prohibited loopback address ({ip_obj})"

    # 2. Cloud metadata IP ranges (169.254.169.254):
    for net in CLOUD_METADATA_IPS:
        if ip_obj in net:
            return True, f"Prohibited cloud metadata network ({ip_obj})"

    # 3. Multicast, link-local, reserved, unspecified:
    if ip_obj.is_multicast or ip_obj.is_reserved or ip_obj.is_unspecified:
        return True, f"Prohibited special or reserved IP address ({ip_obj})"

    # 4. RFC 1918 Private subnets (unless allow_private_ips is explicitly True):
    if not allow_private_ips and ip_obj.is_private:
        return True, f"Prohibited private subnet address ({ip_obj})"

    return False, ""


def validate_safe_url(url: str, allow_private_ips: bool = False) -> Tuple[bool, Optional[str], Optional[str]]:
    """
    Validates that a URL is structurally sound and resolves only to non-hostile IPs.

    Args:
        url: Full URL string to validate (e.g. 'https://api.example.com/healthz').
        allow_private_ips: If True, allows internal RFC 1918 IPs (for local testing).

    Returns:
        Tuple[is_safe, resolved_ip, error_message]
    """
    if not url or not isinstance(url, str):
        return False, None, "URL must be a non-empty string"

    try:
        parsed = urlparse(url.strip())
    except Exception as exc:
        return False, None, f"Malformed URL syntax: {exc}"

    # 1. Scheme Validation: Only http and https permitted:
    if parsed.scheme.lower() not in ("http", "https"):
        return False, None, f"Unsupported URL scheme '{parsed.scheme}'. Only HTTP and HTTPS are permitted."

    hostname = parsed.hostname
    if not hostname:
        return False, None, "URL is missing a valid hostname or IP address"

    # Reject plain IPv6 loopback string literals like [::1]:
    clean_host = hostname.strip("[]")

    # 2. DNS Resolution & IP Inspection:
    try:
        # Check if hostname is already a direct IP literal:
        ip_obj = ipaddress.ip_address(clean_host)
        is_blocked, reason = is_ip_blocked(ip_obj, allow_private_ips)
        if is_blocked:
            return False, str(ip_obj), reason
        return True, str(ip_obj), None
    except ValueError:
        # Hostname is a domain name — resolve via DNS:
        pass

    try:
        # Resolve all A and AAAA records for the hostname:
        addr_info = socket.getaddrinfo(hostname, parsed.port or (443 if parsed.scheme == "https" else 80))
        if not addr_info:
            return False, None, f"Failed to resolve DNS records for hostname '{hostname}'"

        resolved_ips = []
        for item in addr_info:
            sockaddr = item[4]
            ip_str = sockaddr[0]
            ip_obj = ipaddress.ip_address(ip_str)
            resolved_ips.append(str(ip_obj))

            is_blocked, reason = is_ip_blocked(ip_obj, allow_private_ips)
            if is_blocked:
                logger.warning(f"[SSRF Protection] Blocked attempt to probe '{hostname}' which resolves to {reason}")
                return False, str(ip_obj), f"Hostname '{hostname}' resolves to a prohibited destination: {reason}"

        return True, resolved_ips[0], None

    except socket.gaierror as exc:
        return False, None, f"DNS resolution failed for '{hostname}': {exc}"
    except Exception as exc:
        return False, None, f"SSRF validation error: {exc}"
