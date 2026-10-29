import os
import subprocess
from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.permissions import AllowAny
from drf_spectacular.utils import extend_schema, OpenApiResponse


class VersionAPIView(APIView):
    """
    GET /api/v1/version/
    Returns active git commit SHA, build timestamp, and environment metadata.
    Safe for public consumption — exposes zero secrets or private credentials.
    """
    permission_classes = [AllowAny]
    authentication_classes = []

    @extend_schema(
        summary="Service Version & Git Commit Identifier",
        description="Returns the active git commit SHA, build timestamp, and environment metadata.",
        responses={200: OpenApiResponse(description="Active service version details.")},
    )
    def get(self, request):
        commit_sha = os.environ.get("GIT_COMMIT_SHA")
        if not commit_sha:
            try:
                commit_sha = subprocess.check_output(
                    ["git", "rev-parse", "HEAD"], stderr=subprocess.DEVNULL
                ).decode("utf-8").strip()
            except Exception:
                commit_sha = "unknown"

        build_time = os.environ.get("BUILD_TIME", "2026-10-29T12:00:00Z")

        return Response({
            "service": "SignalBridge Webhook Engine",
            "git_commit": commit_sha,
            "build_time": build_time,
            "environment": os.environ.get("DJANGO_SETTINGS_MODULE", "").split(".")[-1] or "production",
        }, status=status.HTTP_200_OK)

