# ==============================================================================
# SignalBridge — PostgreSQL Automated Backup Script (PowerShell / Windows)
# ==============================================================================
param(
    [string]$BackupDir = "backups",
    [string]$DbName = $env:POSTGRES_DB,
    [string]$DbUser = $env:POSTGRES_USER,
    [string]$DbHost = $env:POSTGRES_HOST,
    [string]$DbPort = $env:POSTGRES_PORT
)

if (-not $DbName) { $DbName = "signalbridge_db" }
if (-not $DbUser) { $DbUser = "postgres" }
if (-not $DbHost) { $DbHost = "localhost" }
if (-not $DbPort) { $DbPort = "5432" }

$Timestamp = Get-Date -Format "yyyyMMdd_HHmmss"
$OutputFile = "$BackupDir/signalbridge_backup_${Timestamp}.dump"
$TempContainerDump = "/tmp/signalbridge_backup_${Timestamp}.dump"

if (-not (Test-Path $BackupDir)) {
    New-Item -ItemType Directory -Path $BackupDir | Out-Null
}

Write-Host "[Backup] Initiating PostgreSQL backup for database '$DbName'..." -ForegroundColor Cyan
Write-Host "[Backup] Destination: $OutputFile"

try {
    # Check if running containerized PostgreSQL service
    docker compose ps postgres --format json 2>$null | Out-Null
    if ($LASTEXITCODE -eq 0) {
        Write-Host "[Backup] Executing pg_dump inside postgres container..." -ForegroundColor Cyan
        docker compose exec -T postgres pg_dump -U $DbUser -d $DbName -F c -b -v -f $TempContainerDump
        docker compose cp "postgres:$TempContainerDump" $OutputFile
        docker compose exec -T postgres rm -f $TempContainerDump
        Write-Host "[Backup] Backup successfully written to $OutputFile" -ForegroundColor Green
    } else {
        # Fallback to direct host pg_dump
        Write-Host "[Backup] Falling back to host pg_dump CLI..." -ForegroundColor Yellow
        pg_dump -h $DbHost -p $DbPort -U $DbUser -F c -b -v -f $OutputFile $DbName
        Write-Host "[Backup] Host pg_dump completed successfully: $OutputFile" -ForegroundColor Green
    }

    # Retention policy: Remove backups older than 14 days
    Get-ChildItem -Path $BackupDir -Filter "signalbridge_backup_*.dump" |
        Where-Object { $_.LastWriteTime -lt (Get-Date).AddDays(-14) } |
        Remove-Item -Force
    Write-Host "[Backup] Pruned backups older than 14 days." -ForegroundColor Gray
} catch {
    Write-Host "[Backup] Backup failed: $_" -ForegroundColor Red
    exit 1
}
