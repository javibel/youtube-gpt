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
$suites += if ($kind -eq 'web') { 'migration:test:routes' } else { 'migration:test:coding-workers' }
if ($WithDatabase) { $suites += @('migration:test:database','migration:test:control','migration:build') }
# The fixture startup policy consumes the real protected BUILD_ID. A previous
# compile-only run intentionally leaves no such artifact, so build it first.
if ($kind -eq 'web') { $suites += 'migration:test:startup' }
$nodeExe = (Get-Command node -CommandType Application | Select-Object -First 1).Source
$gitCommit = (& git -C $repo rev-parse --verify HEAD).Trim()
if ($LASTEXITCODE -ne 0 -or $gitCommit -notmatch '^[a-f0-9]{40}$') { throw 'Cannot identify local verification commit' }
$worktreeChanges = @(& git -C $repo status --porcelain --untracked-files=normal)
if ($LASTEXITCODE -ne 0) { throw 'Cannot inspect local verification worktree' }
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
$unexpectedFailure = $false
$activeSuite = $null
Push-Location -LiteralPath $repo
try {
    foreach ($suite in $suites) {
        $activeSuite = $suite
        $command = $scripts.PSObject.Properties[$suite].Value
        if (-not $command) { throw "Missing verification suite: $suite" }
        $started = Get-Date
        $failed = $false
        Write-Output "Checking $suite"
        foreach ($part in ($command -split ' && ')) {
            $arguments = $part -split ' '
            if ($arguments[0] -ne 'node' -or $arguments.Count -lt 2 -or ($arguments | Where-Object { $_ -notmatch '^[-A-Za-z0-9_./]+$' }) -or ($arguments[1] -split '/') -contains '..' -or [IO.Path]::IsPathRooted($arguments[1])) { throw 'Expected an explicit local Node verification entry' }
            Add-Content -LiteralPath $logFile -Value "$suite :: $part"
            $outputOffset = [IO.File]::ReadAllText($logFile).Length
            $executionArguments = @($arguments[1..($arguments.Count - 1)])
            # execArgv changes inside build-local only reach its workers. These
            # flags must also be present when the main Node process starts.
            if ($arguments[1] -eq 'scripts/migration/build-local.cjs') {
                $executionArguments = @('--trace-exit','--trace-uncaught','--unhandled-rejections=strict') + $executionArguments
            }
            & $nodeExe @executionArguments *>> $logFile
            if ($LASTEXITCODE -ne 0) { $failed = $true; break }
            if ($arguments[1] -eq 'scripts/migration/database.test.cjs') {
                # Exit zero alone cannot prove a Promise-based contract finished.
                $databaseOutput = [IO.File]::ReadAllText($logFile).Substring($outputOffset).Trim()
                try {
                    $databaseReport = $databaseOutput | ConvertFrom-Json -AsHashtable -ErrorAction Stop
                    if ($databaseReport.status -ne 'PASS' -or $databaseReport.results -isnot [array] -or $databaseReport.results.Count -eq 0) { throw 'Missing successful database terminal report' }
                } catch {
                    Add-Content -LiteralPath $logFile -Value 'FAIL: database exit without a valid terminal report'
                    $failed = $true; break
                }
            }
        }
        $status = if ($failed) { 'FAIL' } else { 'PASS' }
        $results += @{ suite=$suite; status=$status; elapsedMs=[int]((Get-Date)-$started).TotalMilliseconds }
        Write-Output "$status $suite"
        if ($failed) { break }
    }
} catch {
    $unexpectedFailure = $true
    Add-Content -LiteralPath $logFile -Value "$activeSuite :: unexpected verifier error: $($_.Exception.Message)"
    if ($activeSuite -and -not ($results | Where-Object { $_.suite -eq $activeSuite })) {
        $results += @{ suite=$activeSuite; status='FAIL'; elapsedMs=0 }
    }
    Write-Output "FAIL $activeSuite"
} finally { Pop-Location }
$worktreeChangesAfter = @(& git -C $repo status --porcelain --untracked-files=normal)
if ($LASTEXITCODE -ne 0) { $unexpectedFailure = $true }
$complete = $results.Count -eq $suites.Count -and -not $unexpectedFailure -and -not ($results | Where-Object { $_.status -ne 'PASS' })
@{ repository=$kind; scope=$(if ($WithDatabase) { 'Synthetic suites, designated PostgreSQL and protected build' } else { 'Synthetic offline suites' }); timestamp=(Get-Date).ToUniversalTime().ToString('o'); commit=$gitCommit; worktreeChanges=($worktreeChanges.Count -gt 0 -or $worktreeChangesAfter.Count -gt 0); complete=$complete; results=$results } | ConvertTo-Json -Depth 10 | Set-Content -LiteralPath (Join-Path $outputs "verificacion-integral-$kind.json")
if (-not $complete) { exit 1 }
