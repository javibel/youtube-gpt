param([switch]$AgentRelease,[switch]$WithDatabase,[switch]$NativeRelease,[switch]$ObserverReader)
$ErrorActionPreference = 'Stop'
$PSNativeCommandUseErrorActionPreference = $false
$repo = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$repoName = Split-Path $repo -Leaf
if ($repoName -notin @('migration-web','migration-agent')) { throw 'An independent migration copy is required' }
$kind = if ($repoName -eq 'migration-web') { 'web' } else { 'agent' }
if ($WithDatabase -and $kind -ne 'web') { throw 'Database/build verification belongs to the isolated web copy' }
if ($ObserverReader) {
    if ($WithDatabase -or $NativeRelease -or $kind -ne 'web') { throw 'Original observation-reader verification requires its own isolated runner' }
    $guard = Join-Path $repo '../migration-reporting/administrative-reader-2026-11-05/fixture-guard.cjs'
    $nodeExe = (Get-Command node -CommandType Application | Select-Object -First 1).Source
    Push-Location -LiteralPath $repo
    try {
        foreach ($entry in @('scripts/migration/configuration-service.test.cjs','scripts/migration/configuration-bootstrap.test.cjs','scripts/migration/shared-runtime.test.cjs','scripts/migration/operational-runtime.test.cjs')) {
            & $nodeExe --require $guard $entry
            $originalExit = $LASTEXITCODE
            if ($originalExit -ne 0) { throw "Affected original program failed: $entry; exit=$originalExit" }
        }
        & $nodeExe --require $guard node_modules/typescript/bin/tsc --noEmit --incremental false --pretty false
        $originalExit = $LASTEXITCODE
        if ($originalExit -ne 0) { throw "Current source type check failed; exit=$originalExit" }
        Write-Output '{"complete":true,"scope":"observer-reader-affected-authentication-and-control","programs":5}'
    } finally { Pop-Location }
    exit 0
}
if ($NativeRelease) {
    if ($WithDatabase -or $kind -ne 'web') { throw 'Native release verification requires its separate owned fixture runner' }
    $guard = Join-Path $repo '../migration-reporting/native-release-2026-11-05/fixture-guard.cjs'
    if (-not (Test-Path -LiteralPath $guard)) { throw 'Native release fixture guard required' }
    $nodeExe = (Get-Command node -CommandType Application | Select-Object -First 1).Source
    # Only programs affected by this release bootstrap/provider/storage seam.
    # No unchanged pilot, build, old PostgreSQL fixture or broad regression run.
    $entries = @('scripts/migration/anthropic-adapter.test.cjs','scripts/migration/anthropic-http.test.cjs','scripts/migration/anthropic-https.test.cjs','scripts/migration/configuration-service.test.cjs','scripts/migration/configuration-bootstrap.test.cjs','scripts/migration/shared-runtime.test.cjs','scripts/migration/operational-runtime.test.cjs','scripts/migration/platform-model-readiness.test.cjs','scripts/migration/native-host-configuration.test.cjs','scripts/migration/native-release-functional.test.cjs')
    Push-Location -LiteralPath $repo
    try {
        foreach ($entry in $entries) {
            & $nodeExe --require $guard $entry
            $originalExit = $LASTEXITCODE
            if ($originalExit -ne 0) { throw "Affected original program failed: $entry; exit=$originalExit" }
        }
        & $nodeExe --require $guard node_modules/typescript/bin/tsc --noEmit --incremental false --pretty false
        $originalExit = $LASTEXITCODE
        if ($originalExit -ne 0) { throw "Current source type check failed; exit=$originalExit" }
        Write-Output '{"complete":true,"scope":"native-release-affected-flow","programs":11}'
    } finally { Pop-Location }
    exit 0
}
if ($AgentRelease) {
    if ($WithDatabase) { throw 'Original agent release checks use their new fixture runner' }
    $guard = Join-Path $repo '../migration-reporting/native-agent-release-2026-11-05-v2/fixture-guard.cjs'
    $nodeExe = (Get-Command node -CommandType Application | Select-Object -First 1).Source
    $entries = if ($kind -eq 'agent') { @('scripts/migration/task-factory.test.cjs','scripts/migration/operational-entry.test.cjs') } else { @('scripts/migration/task-factory.test.cjs','scripts/migration/shared-runtime.test.cjs','scripts/migration/operational-runtime.test.cjs') }
    Push-Location -LiteralPath $repo
    try {
        foreach ($entry in $entries) {
            & $nodeExe --require $guard $entry
            if ($LASTEXITCODE -ne 0) { throw "Strictly affected release program failed: $entry" }
        }
        if ($kind -eq 'web') {
            & $nodeExe --require $guard node_modules/typescript/bin/tsc --noEmit --incremental false --pretty false
            if ($LASTEXITCODE -ne 0) { throw 'Current source type check failed' }
        }
        @{complete=$true;scope='original-agent-release-affected';kind=$kind;programs=($entries.Count+$(if($kind -eq 'web'){1}else{0}))}|ConvertTo-Json -Compress
    } finally { Pop-Location }
    exit 0
}

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
        $programResults = @()
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
            $programStarted = Get-Date
            & $nodeExe @executionArguments *>> $logFile
            # Capture the actual original exit before any other native command.
            # Stage metadata describes a failure only; it cannot prove completion.
            $programExitCode = $LASTEXITCODE
            $programResult = @{ entry=$arguments[1]; exitCode=$programExitCode; elapsedMs=[int]((Get-Date)-$programStarted).TotalMilliseconds }
            if ($programExitCode -ne 0 -and $arguments[1] -eq 'scripts/migration/build-local.cjs') {
                try {
                    $buildDiagnostic = Get-Content -LiteralPath (Join-Path $repo '.next/diagnostics/build-diagnostics.json') -Raw | ConvertFrom-Json -ErrorAction Stop
                    $programResult.buildStage = $buildDiagnostic.buildStage
                } catch { $programResult.buildStage = 'unconfirmed' }
            }
            $programResults += $programResult
            if ($programExitCode -ne 0) {
                Add-Content -LiteralPath $logFile -Value ('Original native program terminal: '+($programResult | ConvertTo-Json -Compress))
                $failed = $true; break
            }
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
        $results += @{ suite=$suite; status=$status; elapsedMs=[int]((Get-Date)-$started).TotalMilliseconds; programs=$programResults }
        Write-Output "$status $suite"
        if ($failed) { break }
    }
} catch {
    $unexpectedFailure = $true
    Add-Content -LiteralPath $logFile -Value "$activeSuite :: unexpected verifier error: $($_.Exception.Message)"
    if ($activeSuite -and -not ($results | Where-Object { $_.suite -eq $activeSuite })) {
        $results += @{ suite=$activeSuite; status='FAIL'; elapsedMs=0; programs=$programResults }
    }
    Write-Output "FAIL $activeSuite"
} finally { Pop-Location }
$worktreeChangesAfter = @(& git -C $repo status --porcelain --untracked-files=normal)
if ($LASTEXITCODE -ne 0) { $unexpectedFailure = $true }
$complete = $results.Count -eq $suites.Count -and -not $unexpectedFailure -and -not ($results | Where-Object { $_.status -ne 'PASS' })
@{ repository=$kind; scope=$(if ($WithDatabase) { 'Synthetic suites, designated PostgreSQL and protected build' } else { 'Synthetic offline suites' }); timestamp=(Get-Date).ToUniversalTime().ToString('o'); commit=$gitCommit; worktreeChanges=($worktreeChanges.Count -gt 0 -or $worktreeChangesAfter.Count -gt 0); complete=$complete; results=$results } | ConvertTo-Json -Depth 10 | Set-Content -LiteralPath (Join-Path $outputs "verificacion-integral-$kind.json")
if (-not $complete) { exit 1 }
