'use strict';

/**
 * GUARDIAN AGENT — Seguridad + Calidad de código
 *
 * Checks (sin API):
 *   1. npm audit — vulnerabilidades en dependencias
 *   2. Security headers — verifica next.config.ts
 *   3. Code patterns — grep patrones peligrosos (eval, innerHTML, hardcoded secrets)
 *   4. .env exposure — archivos sensibles en público
 *   5. HTTPS/mixed content — verifica que la web carga por HTTPS
 *   6. Build health — verifica que el build no tiene errores TypeScript
 *
 * Check con API (1 llamada Haiku):
 *   7. Análisis inteligente — Claude resume hallazgos y prioriza
 *
 * Output: reports/guardian-YYYY-MM-DD.json
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { guardedCall } = require('./api-guard');
const mem = require('./agent-memory');
const { registerFixes, applyFixes } = require('./auto-fix');
const { diagnose } = require('./doctor');

const WEB_DIR = path.join(__dirname, '..', 'youtube-gpt');
const REPORTS_DIR = path.join(__dirname, 'reports');

// ── Helpers ─────────────────────────────────────────────────────────────────

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function exec(cmd, cwd = WEB_DIR) {
  try {
    return execSync(cmd, { cwd, encoding: 'utf-8', timeout: 60000, stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
  } catch (err) {
    return err.stdout || err.stderr || err.message || '';
  }
}

function grepFiles(pattern, dir, extensions = ['ts', 'tsx', 'js', 'jsx']) {
  const results = [];
  const extSet = new Set(extensions);

  function walk(d) {
    let entries;
    try { entries = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
    for (const entry of entries) {
      const fullPath = path.join(d, entry.name);
      if (entry.isDirectory()) {
        if (['node_modules', '.next', '.git', 'chrome-profile', 'chrome-profiles'].includes(entry.name)) continue;
        walk(fullPath);
      } else if (entry.isFile()) {
        const ext = entry.name.split('.').pop();
        if (!extSet.has(ext)) continue;
        try {
          const content = fs.readFileSync(fullPath, 'utf-8');
          const lines = content.split('\n');
          for (let i = 0; i < lines.length; i++) {
            if (pattern.test(lines[i])) {
              // Gather surrounding context (±3 lines) for false-positive filtering
              const context = lines.slice(Math.max(0, i - 3), Math.min(lines.length, i + 4)).join('\n');
              results.push({
                file: path.relative(WEB_DIR, fullPath).replace(/\\/g, '/'),
                line: i + 1,
                match: lines[i].trim().slice(0, 120),
                context,
              });
            }
          }
        } catch { /* skip unreadable */ }
      }
    }
  }
  walk(dir);
  return results;
}

// ── Checks ──────────────────────────────────────────────────────────────────

function checkNpmAudit() {
  const raw = exec('npm audit --json 2>&1');
  try {
    const data = JSON.parse(raw);
    const vulns = data.vulnerabilities || {};
    const summary = { critical: 0, high: 0, moderate: 0, low: 0, total: 0, details: [] };
    for (const [name, info] of Object.entries(vulns)) {
      const sev = info.severity || 'low';
      summary[sev] = (summary[sev] || 0) + 1;
      summary.total++;
      if (sev === 'critical' || sev === 'high') {
        summary.details.push({ package: name, severity: sev, title: info.via?.[0]?.title || '', fixAvailable: !!info.fixAvailable });
      }
    }
    return summary;
  } catch {
    return { critical: 0, high: 0, moderate: 0, low: 0, total: 0, details: [], error: 'Could not parse npm audit' };
  }
}

function checkSecurityHeaders() {
  const configPath = path.join(WEB_DIR, 'next.config.ts');
  const issues = [];
  const required = [
    'X-Content-Type-Options',
    'X-Frame-Options',
    'Referrer-Policy',
    'Strict-Transport-Security',
    'Content-Security-Policy',
    'Permissions-Policy',
  ];

  try {
    const content = fs.readFileSync(configPath, 'utf-8');
    for (const header of required) {
      if (!content.includes(header)) {
        issues.push({ header, status: 'MISSING', severity: header === 'Content-Security-Policy' ? 'medium' : 'low' });
      }
    }
  } catch {
    issues.push({ header: 'ALL', status: 'ERROR', severity: 'high', note: 'Cannot read next.config.ts' });
  }
  return issues;
}

function checkDangerousPatterns() {
  const patterns = [
    { pattern: /\beval\s*\(/, name: 'eval()', severity: 'critical' },
    { pattern: /\bdangerouslySetInnerHTML\b/, name: 'dangerouslySetInnerHTML', severity: 'medium' },
    { pattern: /\.innerHTML\s*=/, name: 'innerHTML assignment', severity: 'high' },
    { pattern: /document\.write\s*\(/, name: 'document.write()', severity: 'high' },
    { pattern: /\bexec\s*\(\s*['"`]/, name: 'exec() with string', severity: 'critical' },
    { pattern: /(?:sk-ant-|sk-proj-|ghp_|gho_|AKIA)[A-Za-z0-9]{10,}/, name: 'Hardcoded API key/secret', severity: 'critical' },
    { pattern: /(?:mongodb|postgres|mysql):\/\/[^/\s]+:[^@/\s]+@/, name: 'Hardcoded DB credentials', severity: 'critical' },
    { pattern: /\bconsole\.(log|warn|error)\(.*(?:password|secret|token|key)/i, name: 'Logging sensitive data', severity: 'high' },
  ];

  const allFindings = [];
  const appDir = path.join(WEB_DIR, 'app');
  const libDir = path.join(WEB_DIR, 'lib');
  const compDir = path.join(WEB_DIR, 'components');

  for (const { pattern, name, severity } of patterns) {
    for (const dir of [appDir, libDir, compDir]) {
      if (!fs.existsSync(dir)) continue;
      const matches = grepFiles(pattern, dir);
      for (const m of matches) {
        // Skip false positives using surrounding context
        const ctx = (m.context || '').toLowerCase();

        // Skip code-execution patterns when they only appear inside a comment line
        // (e.g. a JSDoc note explaining why dangerouslySetInnerHTML was removed).
        // NOT applied to secret/credential patterns — a leaked key in a comment is still a leak.
        const CODE_EXEC_PATTERNS = new Set(['dangerouslySetInnerHTML', 'eval()', 'innerHTML assignment', 'document.write()', 'exec() with string']);
        if (CODE_EXEC_PATTERNS.has(name) && /^(\/\/|\*|\/\*|\{\/\*|<!--)/.test((m.match || '').trim())) continue;

        // dangerouslySetInnerHTML in JSON-LD <script type="application/ld+json"> is safe
        if (name === 'dangerouslySetInnerHTML' && (ctx.includes('json.stringify') || ctx.includes('ld+json'))) continue;

        // "Logging sensitive data" — only flag when a variable (not a string label) contains the keyword
        // Skip: console.error('Password changed email error:', err) — "password" is in the label, not a leaked value
        if (name === 'Logging sensitive data') {
          const line = m.match;
          // Remove string literals (single, double, backtick) and template expressions like 'no access_token'
          const stripped = line
            .replace(/['"][^'"]*['"]/g, '')       // single/double quoted strings
            .replace(/`[^`]*`/g, '')              // template literals
            .replace(/\$\{[^}]*\}/g, '');         // template expressions inside backticks
          if (!/(?:password|secret|token|key)/i.test(stripped)) continue;
          // Also skip if the keyword is part of a compound word like "access_token" in an error label
          if (/\b(?:access_token|refresh_token|error_description)\b/i.test(line) && /console\.\w+\(.*(?:fail|error|warn)/i.test(line)) continue;
        }

        // Remove context from saved findings to keep report lean
        const { context: _ctx, ...finding } = m;
        allFindings.push({ ...finding, pattern: name, severity });
      }
    }
  }
  return allFindings;
}

function checkExposedFiles() {
  const issues = [];
  const sensitive = ['.env', '.env.local', '.env.production', 'credentials.json', 'serviceAccountKey.json'];
  const publicDir = path.join(WEB_DIR, 'public');

  for (const file of sensitive) {
    const fullPath = path.join(publicDir, file);
    if (fs.existsSync(fullPath)) {
      issues.push({ file: `public/${file}`, severity: 'critical', note: 'Sensitive file in public directory' });
    }
  }

  // Check .gitignore includes .env
  const gitignore = path.join(WEB_DIR, '.gitignore');
  if (fs.existsSync(gitignore)) {
    const content = fs.readFileSync(gitignore, 'utf-8');
    if (!content.includes('.env')) {
      issues.push({ file: '.gitignore', severity: 'high', note: '.env not in .gitignore' });
    }
  }

  return issues;
}

function checkTypeScript() {
  const raw = exec('npx tsc --noEmit --pretty false 2>&1 | head -50');
  const errors = (raw.match(/error TS\d+/g) || []).length;
  const firstErrors = raw.split('\n').filter(l => l.includes('error TS')).slice(0, 5);
  return { errorCount: errors, sample: firstErrors };
}

function checkHttps() {
  const issues = [];
  // Check for http:// links in code (excluding localhost)
  const httpMatches = grepFiles(/http:\/\/(?!localhost|127\.0\.0\.1|0\.0\.0\.0)/, path.join(WEB_DIR, 'app'));
  for (const m of httpMatches) {
    if (m.match.includes('http://schema.org')) continue; // JSON-LD is fine
    issues.push({ ...m, note: 'Non-HTTPS URL' });
  }
  return issues;
}

// ── Main ────────────────────────────────────────────────────────────────────

async function runGuardian() {
  console.log('[guardian] Starting security & code audit...');
  const startTime = Date.now();

  const results = {
    timestamp: new Date().toISOString(),
    agent: 'guardian',
    checks: {},
    summary: { critical: 0, high: 0, medium: 0, low: 0, info: 0 },
  };

  // 1. npm audit
  console.log('[guardian] Running npm audit...');
  results.checks.npmAudit = checkNpmAudit();

  // 2. Security headers
  console.log('[guardian] Checking security headers...');
  results.checks.securityHeaders = checkSecurityHeaders();

  // 3. Dangerous code patterns
  console.log('[guardian] Scanning for dangerous patterns...');
  results.checks.dangerousPatterns = checkDangerousPatterns();

  // 4. Exposed sensitive files
  console.log('[guardian] Checking exposed files...');
  results.checks.exposedFiles = checkExposedFiles();

  // 5. TypeScript errors
  console.log('[guardian] Checking TypeScript...');
  results.checks.typescript = checkTypeScript();

  // 6. HTTPS/mixed content
  console.log('[guardian] Checking HTTPS...');
  results.checks.httpsIssues = checkHttps();

  // Count severities
  const countSev = (items, sevField = 'severity') => {
    if (!Array.isArray(items)) return;
    for (const item of items) {
      const sev = item[sevField] || 'info';
      results.summary[sev] = (results.summary[sev] || 0) + 1;
    }
  };

  // npm audit severities
  results.summary.critical += results.checks.npmAudit.critical || 0;
  results.summary.high += results.checks.npmAudit.high || 0;
  results.summary.medium += results.checks.npmAudit.moderate || 0;
  results.summary.low += results.checks.npmAudit.low || 0;

  countSev(results.checks.securityHeaders);
  countSev(results.checks.dangerousPatterns);
  countSev(results.checks.exposedFiles);

  if (results.checks.typescript.errorCount > 0) {
    results.summary.medium += 1;
  }
  results.summary.info += results.checks.httpsIssues.length;

  // ── Memory: convert all findings to standard format ──────────────────────
  console.log('[guardian] Processing memory...');
  const memory = mem.loadMemory('guardian');
  const currentFindings = [];

  // npm audit vulnerabilities
  for (const detail of (results.checks.npmAudit.details || [])) {
    currentFindings.push({
      id: mem.issueId('npm_vuln', detail.package),
      category: 'npm_vuln',
      severity: detail.severity,
      description: `npm: ${detail.package} — ${detail.title || detail.severity}${detail.fixAvailable ? ' (fix disponible)' : ''}`,
    });
  }

  // Security headers missing
  for (const h of results.checks.securityHeaders) {
    currentFindings.push({
      id: mem.issueId('header', h.header),
      category: 'header',
      severity: h.severity,
      description: `Header ${h.header} ${h.status}`,
    });
  }

  // Dangerous code patterns (only medium+ severity, skip info)
  for (const p of results.checks.dangerousPatterns) {
    if (p.severity === 'info') continue;
    currentFindings.push({
      id: mem.issueId('code_pattern', `${p.pattern}::${p.file}:${p.line}`),
      category: 'code_pattern',
      severity: p.severity,
      description: `${p.pattern} en ${p.file}:${p.line}`,
    });
  }

  // Exposed files
  for (const e of results.checks.exposedFiles) {
    currentFindings.push({
      id: mem.issueId('exposed_file', e.file),
      category: 'exposed_file',
      severity: e.severity,
      description: `Archivo sensible expuesto: ${e.file}`,
    });
  }

  // TypeScript errors
  if (results.checks.typescript.errorCount > 0) {
    currentFindings.push({
      id: mem.issueId('typescript', 'build_errors'),
      category: 'typescript',
      severity: 'medium',
      description: `${results.checks.typescript.errorCount} errores TypeScript`,
    });
  }

  // Process against memory
  const { newIssues, recurringIssues, resolvedIssues, escalatedIssues } = mem.processFindings(memory, currentFindings);

  // Record trend
  mem.recordTrend(memory, {
    critical: results.summary.critical,
    high: results.summary.high,
    medium: results.summary.medium,
    low: results.summary.low,
    totalFindings: currentFindings.length,
    newIssues: newIssues.length,
    resolved: resolvedIssues.length,
    escalated: escalatedIssues.length,
  });

  // Add memory context to results
  results.memory = {
    newIssues: newIssues.length,
    recurringIssues: recurringIssues.length,
    resolvedIssues: resolvedIssues.length,
    escalatedIssues: escalatedIssues.length,
    regressions: newIssues.filter(i => i.regression).length,
    totalOpenIssues: memory.knownIssues.filter(i => i.status === 'open').length,
  };

  console.log(`[guardian] Memory: ${newIssues.length} new, ${recurringIssues.length} recurring, ${resolvedIssues.length} resolved, ${escalatedIssues.length} escalated`);

  // ── AI analysis (enriched with memory context) ─────────────────────────
  const totalIssues = results.summary.critical + results.summary.high + results.summary.medium;
  if (totalIssues > 0) {
    console.log('[guardian] Requesting AI analysis...');
    try {
      const findingsSummary = JSON.stringify({
        npmAudit: { critical: results.checks.npmAudit.critical, high: results.checks.npmAudit.high, details: results.checks.npmAudit.details?.slice(0, 5) },
        missingHeaders: results.checks.securityHeaders.filter(h => h.severity !== 'low'),
        dangerousPatterns: results.checks.dangerousPatterns.slice(0, 10),
        exposedFiles: results.checks.exposedFiles,
        tsErrors: results.checks.typescript.errorCount,
      });

      // Add memory context to AI prompt
      let memoryContext = '';
      if (escalatedIssues.length > 0) {
        memoryContext += `\n\nISSUES ESCALADOS (persisten ${mem.loadMemory('guardian') ? '7+' : ''} dias sin resolver):\n`;
        memoryContext += escalatedIssues.map(i => `- [${i.severity}] ${i.description} (desde ${i.firstSeen}, ${i.occurrences} ocurrencias)`).join('\n');
      }
      if (newIssues.filter(i => i.regression).length > 0) {
        memoryContext += `\n\nREGRESIONES (issues que se habian resuelto pero han vuelto):\n`;
        memoryContext += newIssues.filter(i => i.regression).map(i => `- [${i.severity}] ${i.description}`).join('\n');
      }
      if (resolvedIssues.length > 0) {
        memoryContext += `\n\nRESOLUCIONES RECIENTES:\n`;
        memoryContext += resolvedIssues.map(i => `- ${i.description} (abierto desde ${i.firstSeen})`).join('\n');
      }

      const { text } = await guardedCall(
        `Hallazgos de la auditoría automática:\n\n${findingsSummary}${memoryContext}`,
        {
          maxTokens: 500,
          agentId: 'guardian',
          system: `Eres un auditor de seguridad web. Analizas hallazgos de auditorías automáticas de YTubViral (Next.js + Vercel + PostgreSQL).

Responde en español con:
1. Los 3 problemas más urgentes (si los hay) — prioriza REGRESIONES y ESCALADOS
2. Una recomendación concreta para cada uno
3. Valoración general (1-10) del estado de seguridad
4. Si hay resoluciones recientes, mencionar brevemente

Sé directo y conciso. Máximo 200 palabras.`,
        }
      );
      results.aiAnalysis = text;
    } catch (err) {
      results.aiAnalysis = `Error en análisis AI: ${err.message}`;
      await diagnose(err, { platform: 'system', action: 'ai-analysis', account: 'guardian' }).catch(() => {});
    }
  } else {
    results.aiAnalysis = 'Sin hallazgos críticos/altos. Estado de seguridad correcto.';
  }

  // Auto-fix: apply corrections
  const allIssues = currentFindings.map(f => f.description);
  const appliedFixes = await applyFixes('guardian', allIssues, results);
  if (appliedFixes.length > 0) {
    console.log(`[guardian] Auto-fixed ${appliedFixes.length} issue(s)`);
    results.autoFixes = appliedFixes;
  }

  results.durationMs = Date.now() - startTime;

  // Save memory
  mem.recordRun(memory, results.durationMs);
  mem.saveMemory('guardian', memory);

  // Save report
  ensureDir(REPORTS_DIR);
  const reportFile = path.join(REPORTS_DIR, `guardian-${results.timestamp.slice(0, 10)}.json`);
  fs.writeFileSync(reportFile, JSON.stringify(results, null, 2));
  console.log(`[guardian] Report saved: ${reportFile} (${results.durationMs}ms)`);

  return results;
}

// ── Auto-Fix Definitions ──────────────────────────────────────────────────────

registerFixes('guardian', [
  {
    id: 'npm-audit-fix',
    description: 'Reportar vulnerabilidades npm con fix disponible (SIN auto-aplicar)',
    cooldownMs: 7 * 86400000, // weekly
    condition: (issues, metrics) => {
      const audit = metrics.checks?.npmAudit;
      return audit && (audit.critical > 0 || audit.high > 0) &&
        audit.details?.some(d => d.fixAvailable);
    },
    // NO auto-aplicar. `npm audit fix --force` es destructivo en proyectos Next.js:
    // al ver vulns transitivas de babel/webpack degrada `next` a una versión major
    // antigua (p.ej. 16 → 9.3.3) para "resolver" el árbol, rompiendo el build.
    // Incidente 2026-07-19/20: reescribió package.json a next@9.3.3 dos noches seguidas.
    // Solo reportamos; la aplicación de fixes de dependencias se hace a mano, revisando
    // que ningún cambio sea un downgrade de una dependencia directa crítica (next, react, prisma).
    apply: (config, issues, metrics) => {
      const audit = metrics.checks?.npmAudit;
      const fixable = (audit?.details || []).filter(d => d.fixAvailable).map(d => d.name || d.module).slice(0, 10);
      return { changed: false, detail: `Fix disponible para: ${fixable.join(', ') || '—'}. NO auto-aplicado (requiere revisión manual — ver comentario en guardian.js).` };
    },
  },
  {
    id: 'gitignore-env',
    description: 'Añadir .env a .gitignore si no está incluido',
    cooldownMs: 30 * 86400000,
    condition: (issues, metrics) => {
      const exposed = metrics.checks?.exposedFiles || [];
      return exposed.some(f => f.file?.includes('.env'));
    },
    apply: () => {
      const gitignore = path.join(WEB_DIR, '.gitignore');
      try {
        const content = fs.existsSync(gitignore) ? fs.readFileSync(gitignore, 'utf8') : '';
        if (content.includes('.env')) return { changed: false, detail: '.env already in .gitignore' };
        fs.appendFileSync(gitignore, '\n.env\n.env.local\n', 'utf8');
        return { changed: false, detail: 'Added .env to .gitignore' };
      } catch { return { changed: false }; }
    },
  },
]);

module.exports = { runGuardian };
