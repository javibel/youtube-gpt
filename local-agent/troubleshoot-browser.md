# Troubleshooting: Browser / Puppeteer / Chrome Profiles

Consultar este archivo ANTES de depurar cualquier problema de navegador, sesiones o Chrome profiles.

---

## Cookies de Edge no funcionan en Puppeteer
Twitter (y posiblemente otras plataformas) vincula la sesion al fingerprint del navegador. Cookies exportadas de Edge son rechazadas en Chrome/Chromium.
**Solucion:** Login manual siempre dentro del Chrome de Puppeteer (`login-persona.js`). Nunca exportar de otro navegador.

## Puppeteer Chromium bundled =/= Chrome real
Si `browser.js` usa Chromium bundled pero `login-persona.js` abre Chrome real, el fingerprint es distinto y la sesion se invalida.
**Solucion (2026-05-12):** `browser.js` usa `executablePath: chrome.exe` para que headless y headed usen el mismo navegador. Verificar que CHROME_PATH apunta a `C:/Program Files/Google/Chrome/Application/chrome.exe`.

## `lockfile` bloquea Chrome profile
Chrome deja 4 archivos de bloqueo: `SingletonLock`, `SingletonCookie`, `DevToolsActivePort`, `lockfile`. Si quedan, Puppeteer diagnostica "corrupt-chrome-profile".
**Solucion (2026-05-12):** `browser.js` limpia los 4 al arrancar. Si el problema persiste:
```bash
for f in SingletonLock SingletonCookie DevToolsActivePort lockfile; do
  rm -f "chrome-profiles/persona-XXX/$f"
done
```

## `taskkill /F` no mata Chrome en Windows
Procesos zombie de Chrome sobreviven a `taskkill`.
**Solucion:** Usar PowerShell:
```powershell
Get-Process chrome -ErrorAction SilentlyContinue | Stop-Process -Force
```

## Twitter bloquea login headless
Ni siquiera con stealth plugin. El boton "Next" no responde a clicks programaticos.
**Solucion:** Login manual obligatorio. No intentar automatizar el flujo de login de Twitter.

## Cerrar Chrome antes de persistSession = cookies perdidas
Si el navegador se cierra antes de ejecutar `persistSession()`, las cookies no se guardan al JSON.
**Solucion:** SIEMPRE ejecutar `persistSession` ANTES de cerrar Chrome. `login-persona.js` ahora lo hace automaticamente.

## NUNCA borrar chrome-profile/ o chrome-profiles/ completo
Contiene sesiones activas de todas las cuentas. Perderlas = re-login manual en todas las plataformas.

## Profiles corruptos por zombie Chrome
Procesos Chrome que no se cerraron correctamente dejan locks que parecen "corrupcion".
**Solucion:** Matar todos los Chrome -> limpiar locks -> reintentar. NO renombrar/borrar el profile.

---

## Procedimiento completo para restaurar sesion Twitter

```
1. Limpiar locks:
   for f in SingletonLock SingletonCookie DevToolsActivePort lockfile; do
     rm -f "chrome-profiles/persona-XXX/$f"
   done

2. Lanzar Chrome visible:
   node login-persona.js persona-XXX twitter

3. Usuario hace login manual y confirma que ve el feed (NO cierra Chrome)

4. login-persona.js detecta login automaticamente, persiste cookies, cierra Chrome

5. Si Chrome no se cerro bien, matar procesos:
   powershell -Command "Get-Process chrome -ErrorAction SilentlyContinue | Stop-Process -Force"

6. Limpiar locks de nuevo

7. login-persona.js verifica headless automaticamente

8. pm2 restart ytubviral-agent
```
