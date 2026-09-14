'use strict';
const assert=require('node:assert/strict');const {inspect,scan}=require('./provider-boundary.cjs');
for(const source of ["import Provider from '@anthropic-ai/sdk'", "const sdk=require('openai')", "fetch('https://api.anthropic.com/v1/messages')", "const model='gpt-5'", "const model='claude-sonnet-4-6'", 'const key=process.env.OPENAI_API_KEY', "const key=process.env['ANTHROPIC_API_KEY']"])assert.ok(inspect(source).length>0,source);
assert.equal(inspect("// import SDK from 'openai'\nimport { getMessagesTask } from '@/lib/ai/task-runtime'; const taskType='youtube.audit-summary';").length,0);
const result=scan();assert.deepEqual(result.violations,[]);console.log(JSON.stringify({scope:'explicit business/provider boundary regression',files:result.files,checks:9,status:'PASS'},null,2));
