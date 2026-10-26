#!/usr/bin/env bash
# ==============================================================================
# SignalBridge — PostgreSQL Database Restoration Script
# ==============================================================================
set -euo pipefail

BACKUP_FILE="${1:-}"
if [ -z "${BACKUP_FILE}" ]; then
    echo "Usage: $0 <path_to_backup.dump>"
    exit 1
fi

if [ ! -f "${BACKUP_FILE}" ]; then
    echo "[Restore] ERROR: Backup file '${BACKUP_FILE}' not found." >&2
    exit 1
fi

DB_NAME="${POSTGRES_DB:-signalbridge_db}"
DB_USER="${POSTGRES_USER:-postgres}"
DB_HOST="${POSTGRES_HOST:-localhost}"
DB_PORT="${POSTGRES_PORT:-5432}"

echo "=================================================================="
echo " SignalBridge PostgreSQL Database Restoration"
echo "=================================================================="
echo "  Source Backup Dump : ${BACKUP_FILE}"
echo "  Target Host        : ${DB_HOST}"
echo "  Target Port        : ${DB_PORT}"
echo "  Target User        : ${DB_USER}"
echo "  Target Database    : ${DB_NAME}"
echo "=================================================================="

FORCE=false
for arg in "$@"; do
    if [ "$arg" == "-f" ] || [ "$arg" == "--force" ]; then
        FORCE=true
    fi
done

if [ "$FORCE" = false ]; then
    echo "[SAFETY GUARD] Restoring will OVERWRITE existing tables in database '${DB_NAME}'."
    read -p "Type the exact target database name '${DB_NAME}' to confirm restoration: " CONFIRM
    if [[ "${CONFIRM}" != "${DB_NAME}" ]]; then
        echo "[Restore] Aborted: Confirmation did not match '${DB_NAME}'. Working database untouched."
        exit 0
    fi
fi

echo "[Restore] Commencing restoration of database '${DB_NAME}' from '${BACKUP_FILE}'..."

DOCKER_CMD=""
if docker compose version &> /dev/null && docker compose ps postgres 2>&1 | grep -q "Up"; then
    DOCKER_CMD="docker compose"
elif command -v docker-compose &> /dev/null && docker-compose ps postgres 2>&1 | grep -q "Up"; then
    DOCKER_CMD="docker-compose"
fi

if [ -n "${DOCKER_CMD}" ]; then
    TEMP_CONTAINER_DUMP="/tmp/restore_target.dump"
    ${DOCKER_CMD} cp "${BACKUP_FILE}" "postgres:${TEMP_CONTAINER_DUMP}"
    
    set +e
    ${DOCKER_CMD} exec -T postgres pg_restore -U "${DB_USER}" -d "${DB_NAME}" --clean --if-exists -v "${TEMP_CONTAINER_DUMP}"
    RESTORE_EXIT_CODE=$?
    set -e

    ${DOCKER_CMD} exec -T postgres rm -f "${TEMP_CONTAINER_DUMP}" 2>/dev/null || true

    if [ ${RESTORE_EXIT_CODE} -le 1 ]; then
        echo "[Restore] Database restoration completed successfully."
    else
        echo "[Restore] ERROR: pg_restore terminated with error code ${RESTORE_EXIT_CODE}" >&2
        exit ${RESTORE_EXIT_CODE}
    fi
else
    set +e
    pg_restore -h "${DB_HOST}" -p "${DB_PORT}" -U "${DB_USER}" -d "${DB_NAME}" --clean --if-exists -v "${BACKUP_FILE}"
    RESTORE_EXIT_CODE=$?
    set -e

    if [ ${RESTORE_EXIT_CODE} -le 1 ]; then
        echo "[Restore] Host pg_restore completed successfully."
    else
        echo "[Restore] ERROR: pg_restore terminated with error code ${RESTORE_EXIT_CODE}" >&2
        exit ${RESTORE_EXIT_CODE}
    fi
fi

echo "[Restore] Database restoration completed successfully."
