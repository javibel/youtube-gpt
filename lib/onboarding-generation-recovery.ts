// Same-tab untrusted selector only. It cannot confirm a result, renew an
// operation, release a reservation or authorize admission/model execution.
export type WelcomeRecovery = { version: 1; key: string; topic: string; body: string };
const slot = (user: string, email: string, lang: string) => 'ytv:welcome:pending:v1:'+JSON.stringify([user,email,lang]);
function parse(value: string|null, lang: string): WelcomeRecovery|null {
  if (!value || value.length > 4096 || !['es','en'].includes(lang)) return null;
  try {
    const record = JSON.parse(value);
    if (!record || Object.keys(record).sort().join(',') !== 'body,key,topic,version' || record.version !== 1
      || typeof record.key !== 'string' || !/^[-A-Za-z0-9._:]{1,128}$/.test(record.key)
      || typeof record.topic !== 'string' || record.topic !== record.topic.trim() || record.topic.length < 3 || record.topic.length > 200
      || typeof record.body !== 'string' || record.body.length > 2048) return null;
    const body = JSON.parse(record.body);
    if (!body || Object.keys(body).sort().join(',') !== 'inputs,lang,template' || body.lang !== lang || body.template !== 'title'
      || !body.inputs || Object.keys(body.inputs).join(',') !== 'tema' || body.inputs.tema !== record.topic) return null;
    return record;
  } catch { return null; }
}
export function readWelcomeRecovery(user: string|undefined, email: string|null|undefined, status: string, lang: string) {
  if (status !== 'authenticated' || !user || !email) return null;
  try { return parse(sessionStorage.getItem(slot(user,email,lang)),lang); } catch { return null; }
}
export function storeWelcomeRecovery(user: string, email: string, lang: string, record: WelcomeRecovery) {
  if (!user || !email) return false;
  try {
    const value = JSON.stringify(record); if (!parse(value,lang)) return false;
    const name = slot(user,email,lang); sessionStorage.setItem(name,value);
    return sessionStorage.getItem(name) === value;
  } catch { return false; }
}
export function clearWelcomeRecovery(user: string, email: string, lang: string, key: string) {
  try {
    const name = slot(user,email,lang);
    if (parse(sessionStorage.getItem(name),lang)?.key === key) {
      sessionStorage.removeItem(name); return sessionStorage.getItem(name) === null;
    }
    return true;
  } catch { return false; }
}
