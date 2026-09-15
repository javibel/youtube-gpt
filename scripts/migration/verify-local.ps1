param([switch]$WithDatabase)
$ErrorActionPreference = 'Stop'
$PSNativeCommandUseErrorActionPreference = $false
$repo = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$repoName = Split-Path $repo -Leaf
if ($repoName -notin @('migration-web','migration-agent')) { throw 'An independent migration copy is required' }
$kind = if ($repoName -eq 'migration-web') { 'web' } else { 'agent' }
if ($WithDatabase -and $kind -ne 'web') { throw 'Database/build verification belongs to the isolated web copy' }
$scripts = (Get-Content -LiteralPath (Join-Path $repo 'package.json') -Raw | ConvertFrom-Json).scripts
$suites = @('migration:check','migration:test','migration:test:contracts','migration:test:adapters','migration:test:reference','migration:test:boundary','migration:test:configuration')
$suites += if ($kind -eq 'web') { @('migration:test:routes','migration:test:startup') } else { 'migration:test:coding-workers' }
if ($WithDatabase) { $suites += @('migration:test:database','migration:test:control','migration:build') }
$nodeExe = (Get-Command node -CommandType Application | Select-Object -First 1).Source
$allowedEnvironment = @('PATH','SystemRoot','ComSpec','PATHEXT','TEMP','TMP','USERPROFILE','APPDATA','LOCALAPPDATA')
foreach ($key in @([Environment]::GetEnvironmentVariables().Keys)) {
    if ($key -notin $allowedEnvironment) { [Environment]::SetEnvironmentVariable($key, $null, 'Process') }
}
$env:NEXT_TELEMETRY_DISABLED = '1'
$outputs = [IO.Path]::GetFullPath((Join-Path $repo '../../outputs'))
[IO.Directory]::CreateDirectory($outputs) | Out-Null
$logFile = Join-Path $outputs "verificacion-integral-$kind.log"
Set-Content -LiteralPath $logFile -Value ''
$results = @()
Push-Location -LiteralPath $repo
try {
    foreach ($suite in $suites) {
        $command = $scripts.PSObject.Properties[$suite].Value
        if (-not $command) { throw "Missing verification suite: $suite" }
        $started = Get-Date
        $failed = $false
        Write-Output "Checking $suite"
        foreach ($part in ($command -split ' && ')) {
            $arguments = $part -split ' '
            if ($arguments[0] -ne 'node' -or $arguments.Count -lt 2 -or ($arguments | Where-Object { $_ -notmatch '^[-A-Za-z0-9_./]+$' }) -or ($arguments[1] -split '/') -contains '..' -or [IO.Path]::IsPathRooted($arguments[1])) { throw 'Expected an explicit local Node verification entry' }
            Add-Content -LiteralPath $logFile -Value "$suite :: $part"
            & $nodeExe @($arguments[1..($arguments.Count - 1)]) *>> $logFile
            if ($LASTEXITCODE -ne 0) { $failed = $true; break }
        }
        $status = if ($failed) { 'FAIL' } else { 'PASS' }
        $results += @{ suite=$suite; status=$status; elapsedMs=[int]((Get-Date)-$started).TotalMilliseconds }
        Write-Output "$status $suite"
        if ($failed) { break }
    }
} finally { Pop-Location }
$complete = $results.Count -eq $suites.Count -and -not ($results | Where-Object { $_.status -ne 'PASS' })
@{ repository=$kind; scope=$(if ($WithDatabase) { 'Synthetic suites, designated PostgreSQL and protected build' } else { 'Synthetic offline suites' }); timestamp=(Get-Date).ToUniversalTime().ToString('o'); complete=$complete; results=$results } | ConvertTo-Json -Depth 10 | Set-Content -LiteralPath (Join-Path $outputs "verificacion-integral-$kind.json")
if (-not $complete) { exit 1 }
