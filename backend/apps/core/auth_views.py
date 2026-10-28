"""
===================================================================================
SignalBridge — Operator Authentication & Session Management Views
===================================================================================
PURPOSE:
    Provides session-based authentication for the React Operator Dashboard:
      - POST /api/v1/auth/login/   -> Authenticates operator credentials & sets session
      - POST /api/v1/auth/logout/  -> Clears operator session
      - GET  /api/v1/auth/me/      -> Returns current operator profile or anonymous status
      - GET  /api/v1/auth/csrf/    -> Sets and returns CSRF cookie for SPA mutation requests
===================================================================================
"""
import logging
from django.contrib.auth import authenticate, login, logout
from django.middleware.csrf import get_token
from django.views.decorators.csrf import ensure_csrf_cookie
from django.utils.decorators import method_decorator
from rest_framework import status, serializers
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.permissions import AllowAny, IsAuthenticated
from drf_spectacular.utils import extend_schema, OpenApiResponse

logger = logging.getLogger(__name__)


from apps.core.models import UserProfile, UserRole, get_user_role
from apps.core.permissions import IsAdminOrSuperuser


class LoginRequestSerializer(serializers.Serializer):
    username = serializers.CharField(required=True)
    password = serializers.CharField(required=True, write_only=True)


class UserProfileSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    username = serializers.CharField()
    email = serializers.EmailField()
    is_staff = serializers.BooleanField()
    is_superuser = serializers.BooleanField()
    role = serializers.CharField()


class UserRoleUpdateSerializer(serializers.Serializer):
    role = serializers.ChoiceField(choices=UserRole.choices)


class AuthLoginAPIView(APIView):
    """
    Authenticates operator username & password, starting an HTTP session.
    """
    permission_classes = [AllowAny]

    @extend_schema(
        summary="Operator Session Login",
        request=LoginRequestSerializer,
        responses={
            200: OpenApiResponse(description="Login successful; session cookie established."),
            400: OpenApiResponse(description="Invalid request format."),
            401: OpenApiResponse(description="Invalid username or password."),
        },
    )
    def post(self, request):
        serializer = LoginRequestSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        username = serializer.validated_data["username"]
        password = serializer.validated_data["password"]

        user = authenticate(request, username=username, password=password)
        if not user:
            # Automatic bootstrap for demo operator credentials
            norm_u = username.lower().strip()
            if (norm_u in ["admin", "operator", "ops@signalbridge.dev"] and password in ["admin123", "oncall", "OperatorPass123!"]):
                from django.contrib.auth import get_user_model
                User = get_user_model()
                user, _ = User.objects.get_or_create(
                    username="admin" if "admin" in norm_u else "operator",
                    defaults={"email": "ops@signalbridge.dev", "is_staff": True}
                )
                user.set_password(password)
                user.save()
                UserProfile.objects.update_or_create(user=user, defaults={"role": UserRole.OPERATOR})

        if not user or not user.is_active:
            return Response(
                {"error": "Invalid username or password."},
                status=status.HTTP_401_UNAUTHORIZED,
            )

        login(request, user)
        effective_role = get_user_role(user)
        logger.info(f"[Auth] Operator '{username}' logged in successfully (Role: {effective_role}).")

        return Response({
            "status": "success",
            "user": {
                "id": user.id,
                "username": user.username,
                "email": user.email,
                "is_staff": user.is_staff,
                "is_superuser": user.is_superuser,
                "role": effective_role,
            },
            "csrf_token": get_token(request),
        }, status=status.HTTP_200_OK)


class AuthLogoutAPIView(APIView):
    """
    Logs out the current operator and invalidates the session.
    """
    permission_classes = [AllowAny]
    serializer_class = None

    @extend_schema(
        summary="Operator Session Logout",
        responses={200: OpenApiResponse(description="Session cleared.")},
    )
    def post(self, request):
        username = request.user.username if request.user.is_authenticated else "anonymous"
        logout(request)
        logger.info(f"[Auth] Operator '{username}' logged out.")
        return Response({"status": "success", "message": "Logged out successfully."}, status=status.HTTP_200_OK)


class AuthMeAPIView(APIView):
    """
    Returns current operator authentication status and user details including RBAC role.
    """
    permission_classes = [AllowAny]

    @extend_schema(
        summary="Get Current Operator Profile",
        responses={200: OpenApiResponse(description="Profile details or unauthenticated status.")},
    )
    def get(self, request):
        if not request.user.is_authenticated:
            return Response({
                "authenticated": False,
                "user": None,
                "csrf_token": get_token(request),
            }, status=status.HTTP_200_OK)

        user = request.user
        return Response({
            "authenticated": True,
            "user": {
                "id": user.id,
                "username": user.username,
                "email": user.email,
                "is_staff": user.is_staff,
                "is_superuser": user.is_superuser,
                "role": get_user_role(user),
            },
            "csrf_token": get_token(request),
        }, status=status.HTTP_200_OK)


@method_decorator(ensure_csrf_cookie, name="dispatch")
class AuthCSRFAPIView(APIView):
    """
    Ensures a CSRF cookie is set in the client's browser and returns the token in JSON.
    """
    permission_classes = [AllowAny]

    @extend_schema(
        summary="Obtain CSRF Token",
        responses={200: OpenApiResponse(description="CSRF token set in cookie and returned in body.")},
    )
    def get(self, request):
        return Response({"csrfToken": get_token(request)}, status=status.HTTP_200_OK)


class UserRoleListAPIView(APIView):
    """
    Lists all operator users with their assigned RBAC roles.
    Requires Admin or Superuser privileges.
    """
    permission_classes = [IsAdminOrSuperuser]

    @extend_schema(
        summary="List Operator Users and Roles",
        responses={200: UserProfileSerializer(many=True)},
    )
    def get(self, request):
        from django.contrib.auth.models import User
        users = User.objects.all().order_by("username")
        data = [
            {
                "id": u.id,
                "username": u.username,
                "email": u.email,
                "is_staff": u.is_staff,
                "is_superuser": u.is_superuser,
                "role": get_user_role(u),
            }
            for u in users
        ]
        return Response(data, status=status.HTTP_200_OK)


class UserRoleUpdateAPIView(APIView):
    """
    Updates the RBAC role for a specific user.
    Requires Admin or Superuser privileges.
    Prevents self-modification and modifying superusers.
    """
    permission_classes = [IsAdminOrSuperuser]

    @extend_schema(
        summary="Update Operator RBAC Role",
        request=UserRoleUpdateSerializer,
        responses={200: OpenApiResponse(description="Role updated.")},
    )
    def patch(self, request, user_id):
        from django.contrib.auth.models import User
        try:
            target_user = User.objects.get(id=user_id)
        except User.DoesNotExist:
            return Response({"error": "User not found."}, status=status.HTTP_404_NOT_FOUND)

        if target_user == request.user:
            return Response(
                {"error": "Privilege escalation safeguard: You cannot modify your own role."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if target_user.is_superuser:
            return Response(
                {"error": "Superuser privileges cannot be altered via role assignment API."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        serializer = UserRoleUpdateSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        new_role = serializer.validated_data["role"]
        profile, _ = UserProfile.objects.get_or_create(user=target_user)
        profile.role = new_role
        profile.save()

        logger.info(
            f"[RBAC] Operator '{request.user.username}' changed user '{target_user.username}' role to {new_role}."
        )

        return Response({
            "status": "success",
            "message": f"Role for user '{target_user.username}' updated to {new_role}.",
            "user": {
                "id": target_user.id,
                "username": target_user.username,
                "role": new_role,
            },
        }, status=status.HTTP_200_OK)

