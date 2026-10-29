import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';
const code=readFileSync(new URL('../lib/model-validation.ts',import.meta.url),'utf8').replace("import 'server-only';",'');
const {validateGenerationModel}=await import('data:text/javascript;base64,'+Buffer.from(stripTypeScriptTypes(code)).toString('base64'));
const provider={enabled:true,adapter:'gemini',credential_env:'GEMINI_API_KEY'};
process.env.GEMINI_API_KEY='fixture-not-real';let requests=0;
globalThis.fetch=async(url,options)=>{requests++;assert.equal(url,'https://generativelanguage.googleapis.com/v1beta/models/fixture');assert.equal(options.headers['x-goog-api-key'],'fixture-not-real');assert.equal(options.cache,'no-store');assert.equal(options.body,undefined);return Response.json({name:'models/fixture',supportedGenerationMethods:['generateContent']});};
await validateGenerationModel('fixture',provider);
assert.equal(requests,1);
await assert.rejects(validateGenerationModel('../invalid',provider),/valid model ID/);
await assert.rejects(validateGenerationModel('fixture',{...provider,enabled:false}),/available Google/);
await assert.rejects(validateGenerationModel('fixture',{...provider,credential_env:'UNSAFE_ENV'}),/credential/);
assert.equal(requests,1);
for(const [status,message] of [[404,/did not find/],[403,/credential/],[429,/rate limited/],[503,/Could not verify/]]){
 globalThis.fetch=async()=>new Response(null,{status});await assert.rejects(validateGenerationModel('fixture',provider),message);
}
globalThis.fetch=async()=>Response.json({name:'models/fixture',supportedGenerationMethods:['embedContent']});await assert.rejects(validateGenerationModel('fixture',provider),/does not support/);
globalThis.fetch=async()=>{throw Error('fixture timeout');};await assert.rejects(validateGenerationModel('fixture',provider),/Try again/);
delete process.env.GEMINI_API_KEY;await assert.rejects(validateGenerationModel('fixture',provider),/credential/);
console.log('PASS Google model metadata validation: valid generation model, unsupported model, invalid name, disabled provider, missing credentials, not found, denied, quota and network failure. No generation calls.');
