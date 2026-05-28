# morning-fix.ps1
# Ejecutado cada mañana a las 09:30 por Windows Task Scheduler.
# Análisis completo: reportes de agentes + Gmail + fixes autónomos de Claude.

$ErrorActionPreference = "Continue"
$today = (Get-Date).ToString("yyyy-MM-dd")
$yesterday = (Get-Date).AddDays(-1).ToString("yyyy-MM-dd")
$logDir = "C:\Users\jimen\youtube-gpt\local-agent\logs"
$logFile = "$logDir\morning-fix-$today.log"
$reportsDir = "C:\Users\jimen\youtube-gpt\local-agent\reports"

if (-not (Test-Path $logDir)) { New-Item -ItemType Directory -Path $logDir -Force | Out-Null }

function Write-Log($msg) {
    $ts = (Get-Date).ToString("yyyy-MM-dd HH:mm:ss")
    $line = "$ts $msg"
    Write-Host $line
    Add-Content -Path $logFile -Value $line -Encoding UTF8
}

Write-Log "=== Morning Fix started ==="

$prompt = @"
Eres el auto-fixer autonomo de YTubViral. Hoy es $today.

MISION: Analisis completo del sistema + aplicar todos los fixes posibles sin intervencion del usuario.
Al terminar escribes un informe JSON con todo lo que hiciste.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
BLOQUE 1 — LECTURA DE REPORTES DE AGENTES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Lee todos los reportes disponibles de hoy y ayer. Para cada uno extrae: status, issues criticos/altos, tendencias.

Reportes a leer (usa Glob para ver cuáles existen):
  C:/Users/jimen/youtube-gpt/local-agent/reports/manager-$today.json
  C:/Users/jimen/youtube-gpt/local-agent/reports/manager-$yesterday.json
  C:/Users/jimen/youtube-gpt/local-agent/reports/pending-for-claude-$today.json
  C:/Users/jimen/youtube-gpt/local-agent/reports/auto-resolver-$today.json
  C:/Users/jimen/youtube-gpt/local-agent/reports/watchdog-$today.json
  C:/Users/jimen/youtube-gpt/local-agent/reports/guardian-$today.json
  C:/Users/jimen/youtube-gpt/local-agent/reports/dmarc-$today.json
  C:/Users/jimen/youtube-gpt/local-agent/reports/dmarc-$yesterday.json
  C:/Users/jimen/youtube-gpt/local-agent/memory/watchdog.json  (issues escalados)

Logs a revisar (últimas 200 líneas):
  C:/Users/jimen/youtube-gpt/local-agent/logs/out.log  (actividad agente)
  C:/Users/jimen/youtube-gpt/local-agent/logs/error.log  (errores recientes)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
BLOQUE 2 — ANÁLISIS DE GMAIL (últimas 24h)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Ejecuta este comando bash para leer Gmail via el modulo del agente (solo lectura, no marca como leidos):
  cd C:/Users/jimen/youtube-gpt/local-agent && node -e "require('dotenv').config();const g=require('./gmail');g.getRecentEmails(30).then(r=>console.log(JSON.stringify(r,null,2))).catch(e=>console.log(JSON.stringify({error:e.message})))"

Si falla, usa los logs como fallback:
  grep "gmail" C:/Users/jimen/youtube-gpt/local-agent/logs/out.log | tail -50

Clasifica los emails encontrados:
  - RESPUESTA_OUTREACH: alguien respondio a un email de prospecto -> registrar en outreach tracker
  - DMARC_ALERT: fallos de autenticacion email -> analizar si hay spoofing
  - USUARIO_REAL: feedback/soporte de usuario real -> documentar
  - STRIPE: pagos, disputes, chargebacks -> documentar urgente
  - IGNORAR: notificaciones automaticas, propios del sistema

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
BLOQUE 3 — FIXES DE CÓDIGO (aplica sin pedir permiso)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Para cada issue encontrado en Bloques 1-2, verifica que existe AHORA y aplica fix si corresponde:

Issues de codigo frecuentes y sus fixes:
  - cookies() en paginas publicas -> reemplazar con getServerLang() de lib/server-lang.ts
  - Cache-Control: private en paginas SEO -> revisar next.config.ts headers
  - Landing lenta (>3s consistente) -> añadir export const revalidate = N en el page.tsx
  - Pagina con query BD en cada request -> mover a ISR o cache
  - Watchdog issue resuelto en produccion pero abierto en memoria -> cerrar en watchdog.json
  - Chrome lock files -> rm chrome-profile/Singleton*
  - PM2 servicio caido -> pm2 restart <nombre>
  - Dep con vulnerabilidad critica -> npm audit fix --force (solo si severity critical)

Issues que NO tocar sin el desarrollador:
  - Cambios de arquitectura mayores
  - Modificar autenticacion/pagos
  - Borrar datos de usuarios
  - Cambiar precios o planes

Working directory para git: C:/Users/jimen/youtube-gpt/youtube-gpt
Working directory para agente: C:/Users/jimen/youtube-gpt/local-agent

Si hay cambios de codigo: git add -A && git commit -m "Auto-fix $today: <descripcion concisa>" && git push

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
BLOQUE 4 — INFORME FINAL
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Escribe el resultado en C:/Users/jimen/youtube-gpt/local-agent/reports/morning-fix-$today.json

Formato exacto:
{
  "date": "$today",
  "timestamp": "<ISO>",
  "agent": "claude-auto-fixer",
  "emailSummary": [
    { "type": "RESPUESTA_OUTREACH|DMARC_ALERT|USUARIO_REAL|STRIPE|IGNORAR", "from": "...", "subject": "...", "action": "..." }
  ],
  "reportSummary": {
    "manager": "<estado general 1 linea>",
    "guardian": "<estado 1 linea>",
    "watchdog": "<estado 1 linea>",
    "dmarc": "<estado 1 linea>",
    "sentinel": "<tendencia + valores>",
    "outreach": "<actividad 1 linea>"
  },
  "resolved": [
    { "issue": "...", "severity": "...", "fix": "...", "commit": "...", "files": [...] }
  ],
  "skipped": [
    { "issue": "...", "reason": "..." }
  ],
  "needsHuman": [
    { "issue": "...", "severity": "critical|high", "recommendation": "..." }
  ],
  "errors": []
}

El campo "needsHuman" es para issues que detectaste pero no puedes resolver autonomamente.
Estos son los que el desarrollador debe ver al abrir Claude por la manana.

REGLAS ABSOLUTAS:
- NUNCA actues sobre algo sin verificar que sigue siendo un problema ahora
- No preguntes nada. Analiza, actua, documenta, termina.
- Si no hay nada que hacer: escribe el JSON igualmente (con arrays vacios) y sal.
- Maximo 40 turnos. Si llevas 35 y no has terminado, guarda lo que tienes y sal.
"@

Write-Log "Launching Claude CLI..."

$claudePath = "C:\Users\jimen\.local\bin\claude.exe"

try {
    $output = & $claudePath `
        --print `
        --dangerously-skip-permissions `
        --allowedTools "Read,Write,Edit,Bash,Glob,Grep" `
        --max-turns 40 `
        "$prompt" 2>&1

    $output | ForEach-Object { Add-Content -Path $logFile -Value $_ -Encoding UTF8 }
    Write-Log "Claude CLI finished (exit: $LASTEXITCODE)"
} catch {
    Write-Log "ERROR launching claude: $_"
}

Write-Log "=== Morning Fix complete ==="
