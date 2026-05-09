$startupFolder = [Environment]::GetFolderPath('Startup')
$vbsPath = 'C:\Users\jimen\youtube-gpt\local-agent\start-tray.vbs'
$shortcutPath = Join-Path $startupFolder 'YTubViral Tray.lnk'
$WshShell = New-Object -ComObject WScript.Shell
$shortcut = $WshShell.CreateShortcut($shortcutPath)
$shortcut.TargetPath = 'wscript.exe'
$shortcut.Arguments = '"' + $vbsPath + '"'
$shortcut.WorkingDirectory = 'C:\Users\jimen\youtube-gpt\local-agent'
$shortcut.Description = 'YTubViral Agent Tray'
$shortcut.Save()
Write-Output "Shortcut created: $shortcutPath"
