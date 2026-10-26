#!/usr/bin/env bash
# ==============================================================================
# SignalBridge — PostgreSQL Automated Backup Script (Bash / POSIX)
# ==============================================================================
set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-backups}"
DB_NAME="${POSTGRES_DB:-signalbridge_db}"
DB_USER="${POSTGRES_USER:-postgres}"
DB_HOST="${POSTGRES_HOST:-localhost}"
DB_PORT="${POSTGRES_PORT:-5432}"

TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
OUTPUT_FILE="${BACKUP_DIR}/signalbridge_backup_${TIMESTAMP}.dump"

mkdir -p "${BACKUP_DIR}"

echo "[Backup] Starting backup for database '${DB_NAME}'..."
DOCKER_CMD=""
if docker compose version &> /dev/null && docker compose ps postgres 2>&1 | grep -q "Up"; then
    DOCKER_CMD="docker compose"
elif command -v docker-compose &> /dev/null && docker-compose ps postgres 2>&1 | grep -q "Up"; then
    DOCKER_CMD="docker-compose"
fi

if [ -n "${DOCKER_CMD}" ]; then
    TEMP_CONTAINER_DUMP="/tmp/backup_${TIMESTAMP}.dump"
    ${DOCKER_CMD} exec -T postgres pg_dump -U "${DB_USER}" -d "${DB_NAME}" -F c -b -v -f "${TEMP_CONTAINER_DUMP}"
    ${DOCKER_CMD} cp "postgres:${TEMP_CONTAINER_DUMP}" "${OUTPUT_FILE}"
    ${DOCKER_CMD} exec -T postgres rm -f "${TEMP_CONTAINER_DUMP}"
    echo "[Backup] Successfully generated containerized dump: ${OUTPUT_FILE}"
elif command -v pg_dump &> /dev/null; then
    pg_dump -h "${DB_HOST}" -p "${DB_PORT}" -U "${DB_USER}" -F c -b -v -f "${OUTPUT_FILE}" "${DB_NAME}"
    echo "[Backup] Host pg_dump completed: ${OUTPUT_FILE}"
else
    echo "[Backup] ERROR: Neither docker compose nor pg_dump was found in PATH." >&2
    exit 1
fi

# Retention policy: Remove backups older than 14 days
find "${BACKUP_DIR}" -name "signalbridge_backup_*.dump" -mtime +14 -delete
echo "[Backup] Pruned backups older than 14 days."
