Add-Type -AssemblyName System.Drawing

$pngPath = "C:\Users\jimen\youtube-gpt\local-agent\icon.png"
$icoPath = "C:\Users\jimen\youtube-gpt\local-agent\icon.ico"

# Convertir PNG a ICO
$bmp = New-Object System.Drawing.Bitmap($pngPath)
$resized = New-Object System.Drawing.Bitmap($bmp, 256, 256)
$icon = [System.Drawing.Icon]::FromHandle($resized.GetHicon())
$stream = [System.IO.FileStream]::new($icoPath, [System.IO.FileMode]::Create)
$icon.Save($stream)
$stream.Close()
$icon.Dispose(); $resized.Dispose(); $bmp.Dispose()
Write-Output "ICO creado: $icoPath"

# Actualizar acceso directo del escritorio
$desktop = [Environment]::GetFolderPath('Desktop')
$lnk = Join-Path $desktop 'YTubViral Restart.lnk'
$ws = New-Object -ComObject WScript.Shell
$sc = $ws.CreateShortcut($lnk)
$sc.TargetPath = 'C:\Users\jimen\youtube-gpt\local-agent\restart.bat'
$sc.WorkingDirectory = 'C:\Users\jimen\youtube-gpt\local-agent'
$sc.Description = 'Relanzar YTubViral Agent'
$sc.IconLocation = "$icoPath,0"
$sc.WindowStyle = 7
$sc.Save()
Write-Output "Acceso directo actualizado: $lnk"
