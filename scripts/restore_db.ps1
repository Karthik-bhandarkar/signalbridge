# ==============================================================================
# SignalBridge — PostgreSQL Database Restoration Script (PowerShell / Windows)
# ==============================================================================
param(
    [Parameter(Mandatory=$true, Position=0)]
    [string]$BackupFile,

    [string]$DbName = $env:POSTGRES_DB,
    [string]$DbUser = $env:POSTGRES_USER,
    [string]$DbHost = $env:POSTGRES_HOST,
    [string]$DbPort = $env:POSTGRES_PORT,
    [switch]$Force
)

if (-not $DbName) { $DbName = "signalbridge_db" }
if (-not $DbUser) { $DbUser = "postgres" }
if (-not $DbHost) { $DbHost = "localhost" }
if (-not $DbPort) { $DbPort = "5432" }

if (-not (Test-Path $BackupFile)) {
    Write-Host "[Restore] ERROR: Backup file '$BackupFile' not found." -ForegroundColor Red
    exit 1
}

Write-Host "==================================================================" -ForegroundColor Cyan
Write-Host " SignalBridge PostgreSQL Database Restoration" -ForegroundColor Cyan
Write-Host "==================================================================" -ForegroundColor Cyan
Write-Host "  Source Backup Dump : $BackupFile" -ForegroundColor Gray
Write-Host "  Target Host        : $DbHost" -ForegroundColor Gray
Write-Host "  Target Port        : $DbPort" -ForegroundColor Gray
Write-Host "  Target User        : $DbUser" -ForegroundColor Gray
Write-Host "  Target Database    : $DbName" -ForegroundColor Yellow
Write-Host "==================================================================" -ForegroundColor Cyan

if (-not $Force) {
    Write-Host "[SAFETY GUARD] Restoring will OVERWRITE existing tables in database '$DbName'." -ForegroundColor Yellow
    $TypedConfirm = Read-Host "Type the exact target database name '$DbName' to confirm restoration"
    if ($TypedConfirm -ne $DbName) {
        Write-Host "[Restore] Aborted: Confirmation did not match '$DbName'. Working database untouched." -ForegroundColor Green
        exit 0
    }
}

Write-Host "[Restore] Commencing restoration of database '$DbName'..." -ForegroundColor Cyan

try {
    # Check if running containerized PostgreSQL service
    docker compose ps postgres --format json 2>$null | Out-Null
    if ($LASTEXITCODE -eq 0) {
        $TempContainerDump = "/tmp/restore_target.dump"
        try {
            Write-Host "[Restore] Transferring dump file to container..." -ForegroundColor Cyan
            docker compose cp $BackupFile "postgres:$TempContainerDump"
            if ($LASTEXITCODE -ne 0) { throw "Failed to copy backup dump into postgres container." }

            Write-Host "[Restore] Executing pg_restore with schema wipe (--clean --if-exists)..." -ForegroundColor Cyan
            docker compose exec -T postgres pg_restore -U $DbUser -d $DbName --clean --if-exists -v $TempContainerDump
            $RestoreExitCode = $LASTEXITCODE

            # Note: pg_restore returns 0 on success, or 1 if warnings (e.g. non-fatal table drop notices).
            if ($RestoreExitCode -le 1) {
                Write-Host "[Restore] Database restoration completed successfully." -ForegroundColor Green
            } else {
                throw "pg_restore terminated with error code $RestoreExitCode"
            }
        } finally {
            docker compose exec -T postgres rm -f $TempContainerDump | Out-Null
        }
    } else {
        # Direct host pg_restore fallback
        Write-Host "[Restore] Executing host pg_restore CLI..." -ForegroundColor Cyan
        pg_restore -h $DbHost -p $DbPort -U $DbUser -d $DbName --clean --if-exists -v $BackupFile
        if ($LASTEXITCODE -le 1) {
            Write-Host "[Restore] Host pg_restore completed successfully." -ForegroundColor Green
        } else {
            throw "pg_restore terminated with error code $LASTEXITCODE"
        }
    }
} catch {
    Write-Host "[Restore] ERROR: $_" -ForegroundColor Red
    exit 1
}
