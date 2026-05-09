$pm2 = "C:\Users\jimen\AppData\Roaming\npm\pm2.cmd"
$tray = "C:\Users\jimen\youtube-gpt\local-agent\tray.ps1"

# Reiniciar agente pm2
& $pm2 restart ytubviral-agent 2>$null
if ($LASTEXITCODE -ne 0) {
    & $pm2 start "C:\Users\jimen\youtube-gpt\local-agent\ecosystem.config.js" 2>$null
}

# Cerrar tray existente (solo el que corre tray.ps1, no este proceso)
Get-WmiObject Win32_Process -Filter "Name='powershell.exe'" | ForEach-Object {
    if ($_.ProcessId -ne $PID -and $_.CommandLine -like "*tray.ps1*") {
        Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue
    }
}

Start-Sleep -Milliseconds 500

# Lanzar tray nuevo
Start-Process powershell -WindowStyle Hidden -ArgumentList "-ExecutionPolicy Bypass -WindowStyle Hidden -File `"$tray`""
