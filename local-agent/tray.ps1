Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

$script:PM2 = "C:\Users\jimen\AppData\Roaming\npm\pm2.cmd"

# Icono de marca con marco de color segun estado
$iconPath = "C:\Users\jimen\youtube-gpt\local-agent\icon.ico"
$brandBmp = (New-Object System.Drawing.Icon($iconPath)).ToBitmap()

function New-FramedIcon([System.Drawing.Color]$frameColor) {
    $size = 32; $border = 3
    $bmp = New-Object System.Drawing.Bitmap($size, $size)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $g.DrawImage($brandBmp, $border, $border, $size - $border * 2, $size - $border * 2)
    $pen = New-Object System.Drawing.Pen($frameColor, $border)
    $pen.Alignment = [System.Drawing.Drawing2D.PenAlignment]::Inset
    $g.DrawRectangle($pen, 0, 0, $size - 1, $size - 1)
    $pen.Dispose(); $g.Dispose()
    return [System.Drawing.Icon]::FromHandle($bmp.GetHicon())
}

$script:iconGreen  = New-FramedIcon([System.Drawing.Color]::FromArgb(50, 200, 80))
$script:iconGray   = New-FramedIcon([System.Drawing.Color]::FromArgb(150, 150, 150))
$script:iconOrange = New-FramedIcon([System.Drawing.Color]::FromArgb(255, 140, 0))

# NotifyIcon
$script:notify = New-Object System.Windows.Forms.NotifyIcon
$script:notify.Icon    = $script:iconGreen
$script:notify.Visible = $true
$script:notify.Text    = "YTubViral Agent - activo"

# Helpers pm2
function Get-AgentStatus {
    try {
        $agentPid = & $script:PM2 pid ytubviral-agent 2>$null
        if ($agentPid -match '^\d+$' -and [int]$agentPid -gt 0) { return 'online' }
        return 'stopped'
    } catch { return 'unknown' }
}

function Get-LastLog {
    try {
        $line = Get-Content "C:\Users\jimen\youtube-gpt\local-agent\logs\out.log" -Tail 1 -ErrorAction Stop
        $clean = $line -replace '^[^|]+\|\s*[^:]+:\s*', ''
        if ($clean.Length -gt 60) { $clean = $clean.Substring(0, 60) }
        return $clean
    } catch { return '' }
}

function Update-Icon {
    $status = Get-AgentStatus
    if ($status -eq 'online') {
        $script:notify.Icon = $script:iconGreen
        $last = Get-LastLog
        $txt = if ($last) { "YTubViral - activo`n$last" } else { "YTubViral - activo" }
        $script:notify.Text = $txt.Substring(0, [Math]::Min(63, $txt.Length))
    } else {
        $script:notify.Icon = $script:iconGray
        $script:notify.Text = "YTubViral - parado"
    }
}

# Menu contextual
$menu = New-Object System.Windows.Forms.ContextMenuStrip

$mLogs = New-Object System.Windows.Forms.ToolStripMenuItem("Ver logs")
$mLogs.Add_Click({
    Start-Process explorer.exe "C:\Users\jimen\youtube-gpt\local-agent\logs"
})

$sep1 = New-Object System.Windows.Forms.ToolStripSeparator

$script:mToggle = New-Object System.Windows.Forms.ToolStripMenuItem("Pausar agente")
$script:mToggle.Add_Click({
    $s = Get-AgentStatus
    if ($s -eq 'online') {
        & $script:PM2 stop ytubviral-agent 2>$null
        $script:mToggle.Text = "Reanudar agente"
        $script:notify.Icon = $script:iconGray
        $script:notify.Text = "YTubViral - parado"
    } else {
        $script:notify.Icon = $script:iconOrange
        $script:notify.Text = "YTubViral - reiniciando..."
        & $script:PM2 restart ytubviral-agent 2>$null
        $script:mToggle.Text = "Pausar agente"
        Start-Sleep -Milliseconds 2000
        Update-Icon
    }
})

$mRestart = New-Object System.Windows.Forms.ToolStripMenuItem("Reiniciar agente")
$mRestart.Add_Click({
    $script:notify.Icon = $script:iconOrange
    $script:notify.Text = "YTubViral - reiniciando..."
    & $script:PM2 restart ytubviral-agent 2>$null
    Start-Sleep -Milliseconds 2000
    Update-Icon
})

$sep2 = New-Object System.Windows.Forms.ToolStripSeparator

$mExit = New-Object System.Windows.Forms.ToolStripMenuItem("Salir del tray")
$mExit.Add_Click({
    $script:notify.Visible = $false
    $script:notify.Dispose()
    [System.Windows.Forms.Application]::Exit()
})

$menu.Items.AddRange(@($mLogs, $sep1, $script:mToggle, $mRestart, $sep2, $mExit))
$script:notify.ContextMenuStrip = $menu

# Actualizar icono cada 30s
$timer = New-Object System.Windows.Forms.Timer
$timer.Interval = 30000
$timer.Add_Tick({ Update-Icon })
$timer.Start()

# Mantener vivo con form oculto
$form = New-Object System.Windows.Forms.Form
$form.WindowState = 'Minimized'
$form.ShowInTaskbar = $false
$form.Opacity = 0

[System.Windows.Forms.Application]::Run($form)
