"""
===================================================================================
SignalBridge — Role-Based Access Control (RBAC) Permission Classes
===================================================================================
PURPOSE:
    Enforces server-side authorization across all SignalBridge REST API endpoints:
      - VIEWER: Read-only access to permitted operational telemetry, incidents,
        alerts, metrics, audit logs, and service health.
      - OPERATOR: Viewer capabilities + operational mutations:
          * Acknowledging, assigning, resolving, reopening incidents
          * Adding incident investigation notes
          * Triggering manual alert retries & synthetic probes
      - ADMIN: Operator capabilities + sensitive configuration & secret management:
          * Creating, updating, deleting integrations
          * Regenerating webhook HMAC signing secrets
          * Creating, updating, deleting notification destinations
          * Creating, updating, deleting monitored synthetic targets
          * Managing operator user roles
      - SUPERUSER: Full administrative privileges per Django security conventions.

SECURITY INVARIANTS:
    1. Unauthenticated requests are rejected with HTTP 401 Unauthorized.
    2. Authenticated users lacking required role privileges receive HTTP 403 Forbidden.
    3. Public webhooks and health check probes are explicitly exempt.
    4. Self-elevation of privileges by ordinary operators is strictly prevented.
===================================================================================
"""
from rest_framework.permissions import BasePermission, SAFE_METHODS
from apps.core.models import UserRole, get_user_role


class IsViewerOrHigher(BasePermission):
    """
    Allows access to any authenticated user with an active role (Viewer, Operator, Admin, Superuser).
    Rejects unauthenticated requests with HTTP 401.
    """
    message = "Authentication required to access operational telemetry."

    def has_permission(self, request, view):
        return bool(request.user and request.user.is_authenticated)


class IsOperatorOrHigher(BasePermission):
    """
    Allows access to Operators, Admins, and Superusers.
    Viewers receive HTTP 403 Forbidden.
    Unauthenticated users receive HTTP 401 Unauthorized.
    """
    message = "Operator or Admin privilege required for operational mutations."

    def has_permission(self, request, view):
        if not (request.user and request.user.is_authenticated):
            return False
        if request.user.is_superuser:
            return True
        role = get_user_role(request.user)
        return role in (UserRole.OPERATOR, UserRole.ADMIN)


class IsAdminOrSuperuser(BasePermission):
    """
    Allows access strictly to Admins and Superusers.
    Operators and Viewers receive HTTP 403 Forbidden.
    Unauthenticated users receive HTTP 401 Unauthorized.
    """
    message = "Admin privilege required for sensitive configuration and secret management."

    def has_permission(self, request, view):
        if not (request.user and request.user.is_authenticated):
            return False
        if request.user.is_superuser:
            return True
        role = get_user_role(request.user)
        return role == UserRole.ADMIN


class IsReadOnlyViewerOrOperatorMutate(BasePermission):
    """
    Safe methods (GET, HEAD, OPTIONS): Requires Viewer or higher.
    Mutation methods (POST, PUT, PATCH, DELETE): Requires Operator or higher.
    """
    message = "Operator privilege required to perform this action."

    def has_permission(self, request, view):
        if not (request.user and request.user.is_authenticated):
            return False
        if request.method in SAFE_METHODS:
            return True
        if request.user.is_superuser:
            return True
        role = get_user_role(request.user)
        return role in (UserRole.OPERATOR, UserRole.ADMIN)


class IsReadOnlyViewerOrAdminMutate(BasePermission):
    """
    Safe methods (GET, HEAD, OPTIONS): Requires Viewer or higher.
    Mutation methods (POST, PUT, PATCH, DELETE): Requires Admin or higher.
    """
    message = "Admin privilege required to create, modify, or delete configuration."

    def has_permission(self, request, view):
        if not (request.user and request.user.is_authenticated):
            return False
        if request.method in SAFE_METHODS:
            return True
        if request.user.is_superuser:
            return True
        role = get_user_role(request.user)
        return role == UserRole.ADMIN
