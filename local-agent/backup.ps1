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
