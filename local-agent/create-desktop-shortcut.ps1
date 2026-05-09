$desktop = [Environment]::GetFolderPath('Desktop')
$lnk = Join-Path $desktop 'YTubViral Restart.lnk'
$ws = New-Object -ComObject WScript.Shell
$sc = $ws.CreateShortcut($lnk)
$sc.TargetPath = 'powershell.exe'
$sc.Arguments = '-ExecutionPolicy Bypass -WindowStyle Hidden -File "C:\Users\jimen\youtube-gpt\local-agent\restart.ps1"'
$sc.WorkingDirectory = 'C:\Users\jimen\youtube-gpt\local-agent'
$sc.Description = 'Relanzar YTubViral Agent'
$sc.IconLocation = 'C:\Users\jimen\youtube-gpt\local-agent\icon.ico,0'
$sc.WindowStyle = 7
$sc.Save()
Write-Output "Shortcut updated: $lnk"
