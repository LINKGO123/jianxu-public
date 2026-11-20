import test from 'node:test';
import https from 'node:https';
import dns from 'node:dns/promises';
import {EventEmitter} from 'node:events';
import {syncBuiltinESMExports} from 'node:module';
import assert from 'node:assert/strict';
import {buildApp} from '../server/app.js';
import {LocalTextApi} from '../client/text-ai/api.js';
import {ConnectionError,httpConnectionError} from '../shared/connection-diagnostics.js';

test('text/image/MCP protected routes preserve diagnostic codes and separate local and upstream HTTP',async t=>{
 let failure=httpConnectionError(401);
 const reject=async()=>{throw failure;};
 const app=await buildApp(false,reject,{image:reject,mcp:reject});t.after(()=>app.close());
 let cookie='';
 const api=new LocalTextApi((async(path,init)=>{
  const headers=Object.fromEntries(new Headers(init?.headers).entries());
  headers.host='127.0.0.1:4173';headers.origin='http://127.0.0.1:4173';if(cookie)headers.cookie=cookie;
  const response=await app.inject({url:String(path),method:(init?.method??'GET') as 'GET'|'PUT'|'POST',headers,...(typeof init?.body==='string'?{payload:init.body}:{})});
  if(response.headers['set-cookie'])cookie=String(response.headers['set-cookie']).split(';')[0];
  assert.ok(!response.body.includes('FICTIONAL_DIAGNOSTIC_KEY'));
  return new Response(response.body,{status:response.statusCode});
 }) as typeof fetch);
 for(const kind of ['text','image','mcp'] as const){
  await api.write(`/api/connections/${kind}`,{baseUrl:'https://example.com/v1',apiKey:'FICTIONAL_DIAGNOSTIC_KEY',...(kind==='mcp'?{}:{model:'fictional'})},'PUT');
  const session=await api.session();
  const connectionId=kind==='text'?session.textConnection!.id:kind==='image'?session.imageConnection!.id:session.mcpConnection!.id;
  for(const status of [401,403,404,429,500]){
   failure=httpConnectionError(status);
   await assert.rejects(api.write(kind==='mcp'?'/api/mcp/discover':`/api/connections/${kind}/test`,{connectionId,requestId:crypto.randomUUID(),...(kind==='image'?{multiple:false}:{})}),error=>{
    assert.ok(error instanceof Error);assert.ok(error.message.includes(failure.diagnostic.code));
    assert.ok(error.message.includes(`服务商HTTP ${status}`));assert.ok(error.message.includes('本机HTTP 502'));
    if(status===429)assert.match(error.message,/仅凭429无法区分/);return true;
   });
   assert.equal((await api.session()).connections[kind],'failed');
  }
  failure=new ConnectionError('无外部响应',{code:'DNS_FAILED',stage:'dns'});
  await assert.rejects(api.write(kind==='mcp'?'/api/mcp/discover':`/api/connections/${kind}/test`,{connectionId,requestId:crypto.randomUUID(),...(kind==='image'?{multiple:false}:{})}),error=>{
   assert.ok(error instanceof Error);assert.match(error.message,/DNS_FAILED/);assert.ok(!error.message.includes('服务商HTTP'));return true;
  });
 }
});

test('official MCP SDK wrapping retains actual upstream error diagnostic',async()=>{
 const {createMcpOperation}=await import('../server/mcp-client.js');
 const operation=createMcpOperation(async()=>{throw httpConnectionError(403);});
 await assert.rejects(operation({baseUrl:'https://example.com/mcp',apiKey:'FICTIONAL_DIAGNOSTIC_KEY'},new AbortController().signal),error=>{
  assert.ok(error instanceof ConnectionError);assert.equal(error.diagnostic.code,'FORBIDDEN');assert.equal(error.diagnostic.upstreamStatus,403);return true;
 });
});

test('saveAndVerify verifies fresh text/image/MCP configurations and never treats saved-but-failed as connected',async t=>{
 t.mock.method(dns,'lookup',async()=>[{address:'8.8.8.8',family:4}]);
 t.mock.method(https,'request',(_url:URL,_options:unknown,callback:(res:unknown)=>void)=>{
  const req=new EventEmitter() as EventEmitter&{end:()=>void;destroy:()=>void};req.destroy=()=>{};
  req.end=()=>{const res=new EventEmitter() as EventEmitter&{statusCode:number;headers:Record<string,string>;destroy:()=>void};res.statusCode=401;res.headers={};res.destroy=()=>{};callback(res);};
  queueMicrotask(()=>{const socket=new EventEmitter() as EventEmitter&{remoteAddress:string};socket.remoteAddress='8.8.8.8';req.emit('socket',socket);socket.emit('secureConnect');});return req;
 });syncBuiltinESMExports();t.after(()=>{t.mock.restoreAll();syncBuiltinESMExports();});
 let fail=false;const calls={text:0,image:0,mcp:0};
 const app=await buildApp(false,async()=>{calls.text++;if(fail)throw httpConnectionError(401);return {choices:[{message:{content:'{"ok":true}'}}]};},{
  image:async(_config,images)=>{calls.image++;if(fail)throw httpConnectionError(401);return {data:[{b64_json:images[0].base64}]};},
  mcp:async()=>{calls.mcp++;if(fail)throw httpConnectionError(401);return {manifest:{id:'a'.repeat(64),tools:[]}};},
 });t.after(()=>app.close());
 let cookie='';
 const api=new LocalTextApi((async(path,init)=>{
  const headers=Object.fromEntries(new Headers(init?.headers).entries());headers.host='127.0.0.1:4173';headers.origin='http://127.0.0.1:4173';if(cookie)headers.cookie=cookie;
  const response=await app.inject({url:String(path),method:(init?.method??'GET') as 'GET'|'PUT'|'POST',headers,...(typeof init?.body==='string'?{payload:init.body}:{})});
  if(response.headers['set-cookie'])cookie=String(response.headers['set-cookie']).split(';')[0];
  assert.ok(!response.body.includes('FICTIONAL_VERIFY_KEY'));return new Response(response.body,{status:response.statusCode});
 }) as typeof fetch);
 for(const kind of ['text','image','mcp'] as const){
  const config={baseUrl:'https://example.com/v1',apiKey:'FICTIONAL_VERIFY_KEY',...(kind==='mcp'?{}:{model:' fictional '})};
  fail=false;const before=calls[kind];
  await api.saveAndVerify(kind,config,crypto.randomUUID(),kind==='image');
  const session=await api.session();assert.equal(session.connections[kind],'connected');
  assert.equal(calls[kind]-before,kind==='image'?2:1);
  if(kind==='mcp')assert.deepEqual(session.mcpConnection!.approved,[]);
  fail=true;
  await assert.rejects(api.saveAndVerify(kind,config,crypto.randomUUID()),/AUTH_FAILED/);
  assert.equal((await api.session()).connections[kind],'failed');
 }
 const before=calls.image;const controller=new AbortController();controller.abort();
 await assert.rejects(api.saveAndVerify('image',{baseUrl:'https://example.com/v1',apiKey:'FICTIONAL_VERIFY_KEY',model:'fictional'},crypto.randomUUID(),false,controller.signal));
 assert.equal(calls.image,before);
 const textBefore=calls.text;
 await assert.rejects(api.saveAndVerify('text',{baseUrl:'https://example.com/v1',apiKey:'',model:'fictional'},crypto.randomUUID()));
 assert.equal(calls.text,textBefore);
});
