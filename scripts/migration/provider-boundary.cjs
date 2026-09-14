'use strict';
const fs=require('node:fs');const path=require('node:path');const ts=require('typescript');
const root=path.resolve(__dirname,'../..');
function inspect(source,file='fixture.ts'){
 const ast=ts.createSourceFile(file,source,ts.ScriptTarget.Latest,true,file.endsWith('.tsx')?ts.ScriptKind.TSX:ts.ScriptKind.TS);const violations=[];
 function visit(node){
  const literal=ts.isStringLiteralLike(node)||ts.isTemplateHead(node)||ts.isTemplateMiddle(node)||ts.isTemplateTail(node);
  if(literal&&(/^(?:@anthropic-ai\/sdk(?:\/|$)|openai(?:\/|$)|@ai-sdk\/(?:openai|anthropic)(?:\/|$))/.test(node.text)||/https?:\/\/api\.(?:anthropic|openai)\.com\b/.test(node.text)||/^(?:claude-(?:haiku|sonnet|opus)-|gpt-\d|o[134](?:-|$))/.test(node.text)))violations.push({file,line:ast.getLineAndCharacterOfPosition(node.getStart(ast)).line+1,rule:'provider-specific dependency, endpoint or model outside adapter'});
  if((ts.isIdentifier(node)||literal)&&/^(?:ANTHROPIC|OPENAI)_API_KEY$/.test(node.text))violations.push({file,line:ast.getLineAndCharacterOfPosition(node.getStart(ast)).line+1,rule:'provider credential outside adapter'});
  ts.forEachChild(node,visit);
 }
 visit(ast);return violations;
}
function scan(){const files=[];function walk(dir){for(const entry of fs.readdirSync(dir,{withFileTypes:true})){const full=path.join(dir,entry.name),relative=path.relative(root,full).replaceAll('\\','/');if(entry.isSymbolicLink())throw Error('Business source cannot be a linked directory/file');if(relative==='lib/ai/adapters')continue;if(entry.isDirectory())walk(full);else if(/\.[cm]?[jt]sx?$/.test(entry.name))files.push({full,relative});}}for(const dir of ['app','lib','utils'])walk(path.join(root,dir));return {files:files.length,violations:files.flatMap(f=>inspect(fs.readFileSync(f.full,'utf8'),f.relative))};}
module.exports={inspect,scan};
if(require.main===module){const result=scan();console.log(JSON.stringify({scope:'static regression guard for explicit provider imports, URLs, models and credential references in business code; not a network sandbox',...result},null,2));if(result.violations.length)process.exitCode=1;}
