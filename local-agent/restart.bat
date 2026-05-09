@echo off
echo Relanzando YTubViral Agent...

:: Reiniciar agente pm2
C:\Users\jimen\AppData\Roaming\npm\pm2.cmd restart ytubviral-agent 2>nul
if errorlevel 1 (
    C:\Users\jimen\AppData\Roaming\npm\pm2.cmd start C:\Users\jimen\youtube-gpt\local-agent\ecosystem.config.js
)
C:\Users\jimen\AppData\Roaming\npm\pm2.cmd save >nul 2>&1

:: Cerrar tray anterior si existe
taskkill /F /IM powershell.exe 2>nul

:: Relanzar tray
start "" /B powershell.exe -ExecutionPolicy Bypass -WindowStyle Hidden -File "C:\Users\jimen\youtube-gpt\local-agent\tray.ps1"

echo Listo.
timeout /t 2 /nobreak >nul
