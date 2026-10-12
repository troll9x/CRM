param(
  [Parameter(Mandatory = $true)]
  [ValidateNotNullOrEmpty()]
  [string] $SourceContainer,

  [Parameter(Mandatory = $true)]
  [ValidatePattern('^[A-Za-z_][A-Za-z0-9_]*$')]
  [string] $DatabaseName,

  [Parameter(Mandatory = $true)]
  [ValidatePattern('^[A-Za-z_][A-Za-z0-9_]*$')]
  [string] $DatabaseUser,

  [Parameter(Mandatory = $true)]
  [ValidateNotNullOrEmpty()]
  [string] $BackupPath,

  [string] $PostgresImage = 'postgres:17.6-bookworm'
)

$ErrorActionPreference = 'Stop'

function Invoke-Docker {
  param([string[]] $Arguments)
  $result = & docker @Arguments
  if ($LASTEXITCODE -ne 0) {
    throw "docker $($Arguments[0]) failed with exit code $LASTEXITCODE."
  }
  return $result
}

function Get-CriticalTableCounts {
  param(
    [string] $Container,
    [string] $User,
    [string] $Database
  )
  $query = @'
SELECT 'businesses:' || COUNT(*) FROM businesses
UNION ALL SELECT 'customers:' || COUNT(*) FROM customers
UNION ALL SELECT 'product_variants:' || COUNT(*) FROM product_variants
UNION ALL SELECT 'sales_orders:' || COUNT(*) FROM sales_orders
UNION ALL SELECT 'sales_order_lines:' || COUNT(*) FROM sales_order_lines
UNION ALL SELECT 'stock_balances:' || COUNT(*) FROM stock_balances
UNION ALL SELECT 'payment_receipts:' || COUNT(*) FROM payment_receipts
UNION ALL SELECT 'payment_allocations:' || COUNT(*) FROM payment_allocations
UNION ALL SELECT 'shipments:' || COUNT(*) FROM shipments
UNION ALL SELECT 'shipment_lines:' || COUNT(*) FROM shipment_lines
UNION ALL SELECT 'stock_movements:' || COUNT(*) FROM stock_movements
UNION ALL SELECT 'receivables:' || COUNT(*) FROM receivables
UNION ALL SELECT 'receivable_settlements:' || COUNT(*) FROM receivable_settlements
UNION ALL SELECT 'return_requests:' || COUNT(*) FROM return_requests
UNION ALL SELECT 'return_lines:' || COUNT(*) FROM return_lines
UNION ALL SELECT 'return_inspections:' || COUNT(*) FROM return_inspections
ORDER BY 1;
'@
  $rows = Invoke-Docker @('exec', $Container, 'psql', '-X', '-A', '-t', '-v', 'ON_ERROR_STOP=1', '-U', $User, '-d', $Database, '-c', $query)
  return @($rows | ForEach-Object { $_.Trim() } | Where-Object { $_ })
}

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
  throw 'Docker CLI is required.'
}
$sourceState = Invoke-Docker @('inspect', '--format', '{{.State.Running}}', $SourceContainer)
if (($sourceState | Select-Object -First 1).Trim() -ne 'true') {
  throw 'Source container must exist and be running; no container will be started automatically.'
}

$absoluteBackupPath = [System.IO.Path]::GetFullPath($BackupPath)
if (Test-Path -LiteralPath $absoluteBackupPath) {
  throw 'Refusing to overwrite an existing backup file.'
}
$backupDirectory = Split-Path -Parent $absoluteBackupPath
if (-not (Test-Path -LiteralPath $backupDirectory)) {
  New-Item -ItemType Directory -Path $backupDirectory -Force | Out-Null
}

$runId = [guid]::NewGuid().ToString('N')
$sourceDumpPath = "/tmp/son-crm-backup-$runId.dump"
$restoreContainer = "crm-restore-verify-$runId"
$restorePassword = [guid]::NewGuid().ToString('N')
$restoreStarted = $false

try {
  $sourceCountsBefore = Get-CriticalTableCounts -Container $SourceContainer -User $DatabaseUser -Database $DatabaseName
  $null = Invoke-Docker @('exec', $SourceContainer, 'pg_dump', '-U', $DatabaseUser, '-d', $DatabaseName, '--format=custom', '--no-owner', '--no-privileges', '-f', $sourceDumpPath)
  $null = Invoke-Docker @('cp', "${SourceContainer}:$sourceDumpPath", $absoluteBackupPath)
  $sourceCounts = Get-CriticalTableCounts -Container $SourceContainer -User $DatabaseUser -Database $DatabaseName
  if (($sourceCountsBefore -join "`n") -cne ($sourceCounts -join "`n")) {
    throw 'Core table row counts changed during backup; run again while writes are quiescent.'
  }

  $null = Invoke-Docker @('run', '--detach', '--name', $restoreContainer, '--env', "POSTGRES_USER=crm_restore", '--env', "POSTGRES_PASSWORD=$restorePassword", '--env', 'POSTGRES_DB=crm_restore', $PostgresImage)
  $restoreStarted = $true
  $ready = $false
  for ($attempt = 0; $attempt -lt 45; $attempt++) {
    & docker exec $restoreContainer pg_isready -U crm_restore -d crm_restore *> $null
    if ($LASTEXITCODE -eq 0) {
      $ready = $true
      break
    }
    Start-Sleep -Seconds 1
  }
  if (-not $ready) {
    throw 'Scratch restore database did not become ready.'
  }

  $null = Invoke-Docker @('cp', $absoluteBackupPath, "${restoreContainer}:/tmp/backup.dump")
  $null = Invoke-Docker @('exec', $restoreContainer, 'pg_restore', '-U', 'crm_restore', '-d', 'crm_restore', '--no-owner', '--no-privileges', '/tmp/backup.dump')
  $restoredCounts = Get-CriticalTableCounts -Container $restoreContainer -User 'crm_restore' -Database 'crm_restore'
  if (($sourceCounts -join "`n") -cne ($restoredCounts -join "`n")) {
    throw "Restore verification failed. Source counts: $($sourceCounts -join ', '); restored counts: $($restoredCounts -join ', ')."
  }

  $hash = (Get-FileHash -Algorithm SHA256 -LiteralPath $absoluteBackupPath).Hash
  Write-Output "Backup created and restored in a fresh scratch container."
  Write-Output "File: $absoluteBackupPath"
  Write-Output "SHA256: $hash"
  Write-Output "Verified core table counts: $($sourceCounts -join ', ')"
  Write-Warning 'The archive is unencrypted and contains CRM data. Restrict access and move it to approved encrypted storage; this script does not configure retention or production scheduling.'
}
finally {
  if ($sourceDumpPath) {
    & docker exec $SourceContainer rm -f $sourceDumpPath *> $null
  }
  if ($restoreStarted) {
    & docker rm -f $restoreContainer *> $null
  }
}
