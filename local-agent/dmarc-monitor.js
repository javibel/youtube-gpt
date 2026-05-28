'use strict';

/**
 * DMARC MONITOR — Analiza reportes DMARC de Google/otros proveedores
 *
 * 1. Busca emails DMARC no leídos en Gmail (from: noreply-dmarc-support@google.com)
 * 2. Descarga adjunto ZIP → extrae XML
 * 3. Parsea y analiza: IPs, DKIM, SPF, disposition
 * 4. Guarda reporte para el Manager
 * 5. Alerta solo si hay anomalías (fallos, IPs desconocidas, spoofing)
 *
 * Cron: diario a las 6am (después de que lleguen los reportes del día anterior)
 */

const fs = require('fs');
const path = require('path');
const { XMLParser } = require('fast-xml-parser');
const AdmZip = require('adm-zip');
const zlib = require('zlib');

const REPORTS_DIR = path.join(__dirname, 'reports');
const GMAIL_BASE = 'https://gmail.googleapis.com/gmail/v1/users/me';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';

// Known legitimate sender IPs (Amazon SES / Resend)
const KNOWN_IP_PREFIXES = [
  '54.240.',   // Amazon SES
  '23.251.',   // Amazon SES
  '69.169.',   // Amazon SES
  '199.255.',  // Amazon SES
  '76.223.',   // Amazon SES
];

// ── Gmail helpers ──────────────────────────────────────────────────────────

async function getAccessToken() {
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.GMAIL_CLIENT_ID || process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GMAIL_CLIENT_SECRET || process.env.GOOGLE_CLIENT_SECRET,
      refresh_token: process.env.GMAIL_REFRESH_TOKEN || process.env.GOOGLE_REFRESH_TOKEN,
      grant_type: 'refresh_token',
    }),
  });
  const data = await res.json();
  if (!data.access_token) throw new Error('Gmail OAuth failed: ' + JSON.stringify(data));
  return data.access_token;
}

async function searchMessages(token, query) {
  const url = `${GMAIL_BASE}/messages?q=${encodeURIComponent(query)}&maxResults=10`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  const data = await res.json();
  return data.messages || [];
}

async function getMessage(token, messageId) {
  const res = await fetch(
    `${GMAIL_BASE}/messages/${messageId}?format=full`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  return res.json();
}

async function getAttachment(token, messageId, attachmentId) {
  const res = await fetch(
    `${GMAIL_BASE}/messages/${messageId}/attachments/${attachmentId}`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  const data = await res.json();
  if (!data.data) throw new Error('No attachment data');
  // Gmail uses URL-safe base64
  return Buffer.from(data.data.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
}

async function addLabel(token, messageId, labelName) {
  // We just mark as read — no need for custom labels
  await fetch(`${GMAIL_BASE}/messages/${messageId}/modify`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ removeLabelIds: ['UNREAD'] }),
  });
}

// ── XML parsing ────────────────────────────────────────────────────────────

function extractXmlFromAttachment(buffer, filename) {
  const lowerName = (filename || '').toLowerCase();

  // ZIP file
  if (lowerName.endsWith('.zip') || buffer[0] === 0x50 && buffer[1] === 0x4B) {
    const zip = new AdmZip(buffer);
    const entries = zip.getEntries();
    for (const entry of entries) {
      if (entry.entryName.endsWith('.xml')) {
        return entry.getData().toString('utf-8');
      }
    }
    throw new Error('No XML found in ZIP');
  }

  // GZIP file
  if (lowerName.endsWith('.gz') || buffer[0] === 0x1F && buffer[1] === 0x8B) {
    const decompressed = zlib.gunzipSync(buffer);
    return decompressed.toString('utf-8');
  }

  // Plain XML
  if (lowerName.endsWith('.xml') || buffer.toString('utf-8', 0, 5).startsWith('<?xml')) {
    return buffer.toString('utf-8');
  }

  throw new Error(`Unknown attachment format: ${filename}`);
}

function parseDmarcReport(xmlString) {
  const parser = new XMLParser({ ignoreAttributes: false, isArray: (name) => name === 'record' });
  const parsed = parser.parse(xmlString);
  const feedback = parsed.feedback;
  if (!feedback) throw new Error('Not a DMARC report XML');

  const meta = feedback.report_metadata || {};
  const policy = feedback.policy_published || {};
  let records = feedback.record || [];
  if (!Array.isArray(records)) records = [records];

  return { meta, policy, records };
}

// ── Analysis ───────────────────────────────────────────────────────────────

function analyzeReport({ meta, policy, records }) {
  const issues = [];
  let totalEmails = 0;
  let passCount = 0;
  let failCount = 0;
  const unknownIPs = [];
  const failedRecords = [];

  for (const record of records) {
    const row = record.row || {};
    const count = parseInt(row.count) || 1;
    totalEmails += count;

    const sourceIp = row.source_ip || 'unknown';
    const evaluated = row.policy_evaluated || {};
    const dkimResult = evaluated.dkim || 'none';
    const spfResult = evaluated.spf || 'none';
    const disposition = evaluated.disposition || 'none';

    const isPass = dkimResult === 'pass' && spfResult === 'pass';
    if (isPass) {
      passCount += count;
    } else {
      failCount += count;
      failedRecords.push({
        ip: sourceIp,
        count,
        dkim: dkimResult,
        spf: spfResult,
        disposition,
        from: record.identifiers?.header_from || 'unknown',
      });
    }

    // Check if IP is known
    const isKnown = KNOWN_IP_PREFIXES.some(prefix => sourceIp.startsWith(prefix));
    if (!isKnown) {
      unknownIPs.push({ ip: sourceIp, count, dkim: dkimResult, spf: spfResult });
    }
  }

  // Build issues list
  if (failCount > 0) {
    issues.push(`${failCount} email(s) con DKIM/SPF FAIL — posible suplantación`);
    for (const r of failedRecords) {
      issues.push(`  IP ${r.ip} (${r.count}x): DKIM=${r.dkim}, SPF=${r.spf}, disposition=${r.disposition}`);
    }
  }

  if (unknownIPs.length > 0) {
    const unknownFailing = unknownIPs.filter(u => u.dkim !== 'pass' || u.spf !== 'pass');
    if (unknownFailing.length > 0) {
      issues.push(`${unknownFailing.length} IP(s) desconocidas con fallos de autenticación`);
      for (const u of unknownFailing) {
        issues.push(`  IP ${u.ip} (${u.count}x): DKIM=${u.dkim}, SPF=${u.spf}`);
      }
    }
  }

  // Check policy
  if (policy.p !== 'quarantine' && policy.p !== 'reject') {
    issues.push(`Política DMARC débil: p=${policy.p} — considerar cambiar a quarantine o reject`);
  }

  const severity = failCount > 0 ? 'critical' : unknownIPs.length > 0 ? 'info' : 'ok';

  return {
    reporter: meta.org_name || 'unknown',
    reportId: meta.report_id || '',
    dateRange: meta.date_range || {},
    domain: policy.domain || 'ytubviral.com',
    policy: policy.p || 'none',
    totalEmails,
    passCount,
    failCount,
    passRate: totalEmails > 0 ? Math.round((passCount / totalEmails) * 100) : 0,
    unknownIPs: unknownIPs.map(u => u.ip),
    issues,
    severity,
    records: records.length,
  };
}

// ── Main ───────────────────────────────────────────────────────────────────

async function runDmarcMonitor() {
  console.log('[dmarc] Starting DMARC report analysis...');
  const today = new Date().toISOString().slice(0, 10);

  let token;
  try {
    token = await getAccessToken();
  } catch (err) {
    console.error('[dmarc] Gmail auth failed:', err.message);
    return null;
  }

  // Search for DMARC reports from the last 3 days (they arrive with delay)
  const query = 'subject:"Report domain: ytubviral.com" newer_than:3d is:unread';
  const messages = await searchMessages(token, query);

  if (messages.length === 0) {
    console.log('[dmarc] No new DMARC reports found');
    return { date: today, reports: [], summary: 'No new reports' };
  }

  console.log(`[dmarc] Found ${messages.length} DMARC report(s)`);
  const analyses = [];

  for (const { id: messageId } of messages) {
    try {
      const msg = await getMessage(token, messageId);
      const headers = msg.payload?.headers || [];
      const subject = (headers.find(h => h.name.toLowerCase() === 'subject')?.value) || '';
      const from = (headers.find(h => h.name.toLowerCase() === 'from')?.value) || '';

      console.log(`[dmarc] Processing: "${subject}" from ${from}`);

      // Find attachment
      const parts = msg.payload?.parts || [];
      let attachmentData = null;
      let attachmentFilename = '';

      for (const part of parts) {
        if (part.body?.attachmentId && part.filename) {
          attachmentData = await getAttachment(token, messageId, part.body.attachmentId);
          attachmentFilename = part.filename;
          break;
        }
        // Nested parts (multipart)
        if (part.parts) {
          for (const subpart of part.parts) {
            if (subpart.body?.attachmentId && subpart.filename) {
              attachmentData = await getAttachment(token, messageId, subpart.body.attachmentId);
              attachmentFilename = subpart.filename;
              break;
            }
          }
          if (attachmentData) break;
        }
      }

      if (!attachmentData) {
        console.log(`[dmarc] No attachment found in "${subject}" — skipping`);
        await addLabel(token, messageId);
        continue;
      }

      // Extract and parse XML
      const xmlString = extractXmlFromAttachment(attachmentData, attachmentFilename);
      const report = parseDmarcReport(xmlString);
      const analysis = analyzeReport(report);

      analyses.push(analysis);

      if (analysis.severity === 'critical') {
        console.error(`[dmarc] ⚠️ CRITICAL: ${analysis.issues.join(' | ')}`);
      } else if (analysis.severity === 'info') {
        console.log(`[dmarc] ℹ️ ${analysis.reporter}: ${analysis.totalEmails} emails, ${analysis.passRate}% pass, unknown IPs: ${analysis.unknownIPs.join(', ')}`);
      } else {
        console.log(`[dmarc] ✅ ${analysis.reporter}: ${analysis.totalEmails} emails, 100% pass`);
      }

      await addLabel(token, messageId);
      await new Promise(r => setTimeout(r, 1000));
    } catch (err) {
      console.error(`[dmarc] Error processing message ${messageId}:`, err.message);
    }
  }

  // Build summary for manager
  const totalEmails = analyses.reduce((s, a) => s + a.totalEmails, 0);
  const totalFails = analyses.reduce((s, a) => s + a.failCount, 0);
  const allIssues = analyses.flatMap(a => a.issues);
  const worstSeverity = analyses.some(a => a.severity === 'critical') ? 'critical'
    : analyses.some(a => a.severity === 'info') ? 'info' : 'ok';

  const result = {
    date: today,
    reportsAnalyzed: analyses.length,
    totalEmails,
    totalFails,
    passRate: totalEmails > 0 ? Math.round(((totalEmails - totalFails) / totalEmails) * 100) : 100,
    severity: worstSeverity,
    issues: allIssues,
    reports: analyses,
  };

  // Save report
  if (!fs.existsSync(REPORTS_DIR)) fs.mkdirSync(REPORTS_DIR, { recursive: true });
  fs.writeFileSync(
    path.join(REPORTS_DIR, `dmarc-${today}.json`),
    JSON.stringify(result, null, 2)
  );

  console.log(`[dmarc] Done. ${analyses.length} report(s), ${totalEmails} emails, ${totalFails} fails, severity: ${worstSeverity}`);
  return result;
}

module.exports = { runDmarcMonitor };

// CLI
if (require.main === module) {
  require('dotenv').config();
  runDmarcMonitor().then(r => {
    if (r) console.log(JSON.stringify(r, null, 2));
  }).catch(e => {
    console.error('Fatal:', e.message);
    process.exit(1);
  });
}
