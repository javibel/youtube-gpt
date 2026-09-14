'use strict';
const fs = require('node:fs');
const path = require('node:path');
const FORBIDDEN_EFFECTS = ['email','publication','payments','restart','repair'];
const fail = reason => { throw new Error(`ISOLATION_BLOCKED: ${reason}`); };
function contained(parent, child) {
  const relative = path.relative(parent, child);
  return relative === '' || (!relative.startsWith('..' + path.sep) && relative !== '..' && !path.isAbsolute(relative));
}
function physicalPath(candidate) {
  const absolute = path.resolve(candidate);
  let current = path.parse(absolute).root;
  for (const segment of absolute.slice(current.length).split(path.sep).filter(Boolean)) {
    current = path.join(current, segment);
    if (!fs.existsSync(current)) fail('path must exist before validation');
    if (fs.lstatSync(current).isSymbolicLink()) fail('links and junctions are forbidden');
  }
  return fs.realpathSync.native(absolute);
}
function validate(config, {root, operationalRoots, environment = {}}) {
  if (!config || config.version !== 1 || config.mode !== 'migration-test') fail('explicit test configuration required');
  const workspace = physicalPath(root);
  if (!Array.isArray(operationalRoots) || operationalRoots.length !== 2) fail('two operational roots must be declared');
  for (const original of operationalRoots.map(physicalPath)) {
    if (contained(original, workspace) || contained(workspace, original)) fail('test and operational roots overlap');
  }
  if (config.providerMode !== 'simulated') fail('real AI credentials require a separately approved test runner');
  for (const effect of FORBIDDEN_EFFECTS) if (config.effects?.[effect] !== 'simulated') fail(`effect ${effect} must be simulated`);
  if (config.gitPush !== false || config.vercelDeploy !== false || config.scheduler !== 'none') fail('publishing and operational schedulers forbidden');
  const required = ['web','agent','database','memory','reports','logs'];
  const paths = {};
  for (const name of required) {
    const rel = config.paths?.[name];
    if (typeof rel !== 'string' || !rel || path.isAbsolute(rel) || /^[a-z]:/i.test(rel) || /[\\/]/.test(rel[0]) || rel.split(/[\\/]/).includes('..')) fail(`unsafe ${name} path`);
    paths[name] = physicalPath(path.join(workspace, rel));
    if (paths[name] === workspace || !contained(workspace, paths[name])) fail(`path ${name} escapes workspace`);
    if (!fs.statSync(paths[name]).isDirectory()) fail(`path ${name} must be a directory`);
  }
  const entries = Object.entries(paths);
  for(let a=0;a<entries.length;a++)for(let b=a+1;b<entries.length;b++) {
    if(contained(entries[a][1],entries[b][1])||contained(entries[b][1],entries[a][1])) fail('test storage paths must be separate');
  }
  let database;
  try { database = new URL(config.databaseUrl); } catch { fail('explicit test database URL required'); }
  if(database.protocol !== 'postgresql:' || database.hostname !== '127.0.0.1' || database.port !== '55432' || database.pathname !== '/ytubviral_migration_test' || database.username !== 'migration_test' || database.password !== 'synthetic_local_only' || database.search || database.hash) fail('database is not the designated local test destination');
  if(config.ports?.web !== 4300 || config.ports?.agent !== 4301) fail('dedicated test ports required');
  // Neither dotenv files nor inherited credentials are accepted by this offline harness.
  for(const dir of [workspace,paths.web,paths.agent]) {
    if(fs.readdirSync(dir).some(name=>/^\.env(?:\.|$)/i.test(name))) fail('dotenv files are forbidden in offline test roots');
  }
  for(const key of Object.keys(environment)) {
    if(/(?:DATABASE_URL|DIRECT_URL|ANTHROPIC|OPENAI|STRIPE|RESEND|TOKEN|SECRET|PASSWORD|API_KEY|NODE_OPTIONS|NODE_PATH|DOTENV|PM2_HOME)/i.test(key)) fail('inherited configuration or credentials are forbidden');
  }
  return {mode:config.mode,providerMode:config.providerMode,paths,ports:config.ports,externalEffects:'simulated',database:'127.0.0.1:55432/ytubviral_migration_test'};
}
function simulatedEffects() {
  const events=[];
  const adapters=Object.fromEntries(FORBIDDEN_EFFECTS.map(effect=>[effect, async payload=>{
    // Deliberately no network, file write, process execution or payload persistence.
    const id=`simulation-${events.length+1}`;
    events.push({id,effect});
    return {id,status:'simulated'};
  }]));
  return {adapters,events};
}
module.exports={validate,simulatedEffects};
