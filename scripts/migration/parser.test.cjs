'use strict';
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const assert=require('node:assert/strict');
const ts=require('typescript');
const entry={exports:{}};
vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(__dirname,'../../lib/parse-fenced-json.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,{exports:entry.exports,module:entry});
const cases=[
 ['Spanish object','{"titulo":"Análisis sintético"}',true],['English object','{"title":"Synthetic analysis"}',true],
 ['nested data','{"a":{"b":[1,true,null]}}',true],['empty object','{}',true],['array','[1,2]',true],
 ['leading whitespace',' \n{"a":1}',true],['trailing whitespace','{"a":1}\n ',true],
 ['JSON fence','```json\n{"a":1}\n```',true],['plain fence','```\n{"a":1}\n```',true],
 ['upper case fence','```JSON\n{"a":1}\n```',true],['leading newline and fence','\n```json\n{"a":1}\n```',true],
 ['escaped text','{"a":"line\\nquote\\\""}',true],
 ['empty input','',false],['truncated object','{"a":',false],['trailing comma','{"a":1,}',false],
 ['unquoted key','{a:1}',false],['comment','{"a":1/*x*/}',false],['two objects','{}{}',false],
 ['prose before JSON','Synthetic reply: {}',false],['non JSON value','undefined',false],
];
for(const [name,input,valid] of cases){if(valid)assert.doesNotThrow(()=>entry.exports.parseFencedJson(input),name);else assert.throws(()=>entry.exports.parseFencedJson(input),undefined,name);}
console.log(JSON.stringify({scope:'syntax parsing only; this helper does not enforce output schemas',passed:cases.length},null,2));
