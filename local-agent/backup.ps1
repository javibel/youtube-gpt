$timestamp = Get-Date -Format 'yyyy-MM-dd'
$source = 'C:\Users\jimen\youtube-gpt\local-agent'
$dest = 'D:\ytubviral-backup\' + $timestamp

Write-Host ('=== YTubViral Backup ' + $timestamp + ' ===') -ForegroundColor Cyan

New-Item -ItemType Directory -Force -Path $dest | Out-Null

$files = @('.env', 'twitter-cookies.json', 'instagram-cookies.json', 'facebook-cookies.json', 'linkedin-cookies.json', 'personas.json')
$folders = @('cookies', 'chrome-profile', 'chrome-profiles', 'memory', 'reports')

foreach ($f in $files) {
    $p = Join-Path $source $f
    if (Test-Path $p) {
        Copy-Item -Path $p -Destination (Join-Path $dest $f) -Force
        Write-Host ('  OK  ' + $f) -ForegroundColor Green
    } else {
        Write-Host ('  --  ' + $f) -ForegroundColor Yellow
    }
}

foreach ($d in $folders) {
    $p = Join-Path $source $d
    if (Test-Path $p) {
        Copy-Item -Path $p -Destination (Join-Path $dest $d) -Recurse -Force
        Write-Host ('  OK  ' + $d + '/') -ForegroundColor Green
    } else {
        Write-Host ('  --  ' + $d + '/') -ForegroundColor Yellow
    }
}

$vercelEnv = 'C:\Users\jimen\youtube-gpt\youtube-gpt\.env.local'
if (Test-Path $vercelEnv) {
    Copy-Item -Path $vercelEnv -Destination (Join-Path $dest 'vercel-env.local') -Force
    Write-Host '  OK  vercel .env.local' -ForegroundColor Green
}

# design-handoff/ vive FUERA del repo git y el repo es publico (contiene info
# sensible de negocio), asi que este ZIP es su UNICO respaldo.
# Se guardan dos copias:
#   1. En la carpeta con fecha -> entra en la rotacion normal de 30 dias
#   2. design-handoff-latest.zip en la raiz -> NO se autoborra nunca, porque los
#      .md (BRIEF, README, SITEMAP, DESIGN-TOKENS) estan escritos a mano y no se
#      pueden regenerar desde el codigo. Sin esta copia, 30 dias sin ejecutar el
#      backup bastarian para perderlos.
$handoff = 'C:\Users\jimen\youtube-gpt\design-handoff'
if (Test-Path $handoff) {
    $zipDated = Join-Path $dest 'design-handoff.zip'
    Compress-Archive -Path (Join-Path $handoff '*') -DestinationPath $zipDated -Force
    Write-Host '  OK  design-handoff.zip' -ForegroundColor Green

    $zipLatest = 'D:\ytubviral-backup\design-handoff-latest.zip'
    Copy-Item -Path $zipDated -Destination $zipLatest -Force
    Write-Host '  OK  design-handoff-latest.zip (permanente)' -ForegroundColor Green
} else {
    Write-Host '  --  design-handoff/' -ForegroundColor Yellow
}

$cutoff = (Get-Date).AddDays(-30)
$backupRoot = 'D:\ytubviral-backup'
Get-ChildItem -Path $backupRoot -Directory | Where-Object {
    try { [datetime]::ParseExact($_.Name, 'yyyy-MM-dd', $null) -lt $cutoff } catch { $false }
} | ForEach-Object {
    Remove-Item -Path $_.FullName -Recurse -Force
    Write-Host ('  Cleaned old: ' + $_.Name) -ForegroundColor DarkGray
}

Write-Host ''
Write-Host ('Backup done: ' + $dest) -ForegroundColor Cyan
$sizeBytes = (Get-ChildItem -Path $dest -Recurse | Measure-Object Length -Sum).Sum
$sizeMB = [math]::Round($sizeBytes / 1MB, 1)
Write-Host ('Size: ' + [string]$sizeMB + ' MB') -ForegroundColor Cyan
