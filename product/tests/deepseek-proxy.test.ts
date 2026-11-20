import test from 'node:test';
import assert from 'node:assert/strict';
import dns from 'node:dns/promises';
import https from 'node:https';
import {syncBuiltinESMExports} from 'node:module';
import {EventEmitter} from 'node:events';
import {resolveTarget,assertRemote,connectionUrl} from '../server/network-policy.js';
import {secureCompletion} from '../server/text-network.js';
import {editImage} from '../server/image-routes.js';
import {buildApp} from '../server/app.js';
import {sessionSchema} from '../shared/schemas.js';

test('official service opt-in accepts only its Fake-IP pool; default, other hosts and mixed private DNS remain rejected',async()=>{
 const url=connectionUrl('https://api.deepseek.com');
 const fake=async()=>[{address:'198.18.0.5',family:4}];
 await assert.rejects(resolveTarget(url,fake));
 assert.equal((await resolveTarget(url,fake,true)).address,'198.18.0.5');
 assert.equal((await resolveTarget(new URL('https://api.openai.com/v1'),fake,true)).address,'198.18.0.5');
 await assert.rejects(resolveTarget(new URL('https://api.openai.com.example.org'),fake,true));
 for(const host of ['api.deepseek.com.example.org','example.com','198.18.0.5'])await assert.rejects(resolveTarget(new URL(`https://${host}`),fake,true));
 for(const address of ['127.0.0.1','169.254.169.254','192.168.1.1']){
  await assert.rejects(resolveTarget(url,async()=>[...await fake(),{address,family:4}],true));
 }
 assert.throws(()=>assertRemote('198.18.0.5','198.18.0.5'));
 assert.doesNotThrow(()=>assertRemote('198.18.0.5','198.18.0.5',true));
 assert.throws(()=>assertRemote('198.18.0.6','198.18.0.5',true));
 assert.throws(()=>assertRemote('127.0.0.1','127.0.0.1',true));
});

test('real secureCompletion honours opt-in, retains official TLS hostname, socket pinning and redirect refusal',async t=>{
 let scenario='ok',sent=0,requests=0,expectedHost='api.deepseek.com';
 const lookup=t.mock.method(dns,'lookup',async()=>[{address:'198.18.0.5',family:4}]);
 const transport=t.mock.method(https,'request',(url:URL,options:{rejectUnauthorized?:boolean;family:number;lookup:Function},callback:(res:unknown)=>void)=>{
  requests++;assert.equal(url.hostname,expectedHost);assert.equal(url.protocol,'https:');assert.notEqual(options.rejectUnauthorized,false);assert.equal(options.family,4);
  options.lookup('',{},(_error:unknown,address:string)=>assert.equal(address,'198.18.0.5'));
  const req=new EventEmitter() as EventEmitter&{destroy:()=>void;end:()=>void};req.destroy=()=>{};
  req.end=()=>{sent++;const res=new EventEmitter() as EventEmitter&{statusCode:number;headers:Record<string,string>;destroy:()=>void};res.statusCode=scenario==='redirect'?302:200;res.headers={'content-type':'application/json'};res.destroy=()=>{};callback(res);queueMicrotask(()=>{res.emit('data',Buffer.from('{"choices":[{"message":{"content":"{\\"ok\\":true}"}}]}'));res.emit('end');});};
  queueMicrotask(()=>{const socket=new EventEmitter() as EventEmitter&{remoteAddress:string};socket.remoteAddress=scenario==='mismatch'?'127.0.0.1':'198.18.0.5';req.emit('socket',socket);if(scenario==='tls')req.emit('error',new Error('FICTIONAL_CERT_FAILURE'));else socket.emit('secureConnect');});return req;
 });syncBuiltinESMExports();
 const config={baseUrl:'https://api.deepseek.com',model:'fictional',apiKey:'FICTIONAL_PROXY_KEY'};
 try{
  await assert.rejects(secureCompletion(config,[],new AbortController().signal),/目标地址/);assert.equal(requests,0);
  await secureCompletion({...config,proxyCompatibility:true},[],new AbortController().signal);assert.equal(sent,1);
  expectedHost='api.openai.com';
  const image={base64:'AAAA',width:1,height:1};
  await assert.rejects(editImage({...config,baseUrl:'https://api.openai.com/v1'},[image],'STYLE',new AbortController().signal),/目标地址/);
  await editImage({...config,baseUrl:'https://api.openai.com/v1',proxyCompatibility:true},[image],'STYLE',new AbortController().signal);
  assert.equal(sent,2);expectedHost='api.deepseek.com';
  for(scenario of ['tls','mismatch','redirect']){const before:number=sent;await assert.rejects(secureCompletion({...config,proxyCompatibility:true},[],new AbortController().signal));assert.equal(sent,before+(scenario==='redirect'?1:0));}
 }finally{lookup.mock.restore();transport.mock.restore();syncBuiltinESMExports();}
});

test('DeepSeek option stays in text memory; DeepSeek images, MCP and other domains remain blocked',async t=>{
 let enabled=false;
 const app=await buildApp(false,async config=>{enabled=config.proxyCompatibility===true;return {choices:[{message:{content:'{"ok":true}'}}]};});t.after(()=>app.close());
 const first=await app.inject({url:'/api/session',headers:{host:'127.0.0.1:4173'}});
 const headers={host:'127.0.0.1:4173',origin:'http://127.0.0.1:4173',cookie:String(first.headers['set-cookie']).split(';')[0],'x-csrf-token':first.json().csrfToken};
 const config={baseUrl:'https://api.deepseek.com',model:'fictional',apiKey:'FICTIONAL_PROXY_KEY',proxyCompatibility:true};
 assert.equal((await app.inject({method:'PUT',url:'/api/connections/text',headers,payload:{...config,baseUrl:'https://example.com'}})).statusCode,400);
 assert.equal((await app.inject({method:'PUT',url:'/api/connections/image',headers,payload:config})).statusCode,400);
 assert.equal((await app.inject({method:'PUT',url:'/api/connections/text',headers,payload:config})).statusCode,200);
 const state=await app.inject({url:'/api/session',headers});const session=sessionSchema.parse(state.json());assert.equal(session.textConnection?.proxyCompatibility,true);assert.ok(!state.body.includes(config.apiKey));
 const response=await app.inject({method:'POST',url:'/api/connections/text/test',headers,payload:{requestId:crypto.randomUUID(),connectionId:session.textConnection!.id}});assert.equal(response.statusCode,200);assert.equal(enabled,true);
 await app.inject({method:'DELETE',url:'/api/connections/text',headers});assert.equal((await app.inject({url:'/api/session',headers})).json().textConnection,undefined);
});

test('OpenAI image option is independently saved, verified and returned to client; other image hosts and MCP cannot opt in',async t=>{
 let enabled=false;
 const app=await buildApp(false,undefined,{image:async(config,images)=>{enabled=config.proxyCompatibility===true;return {data:[{b64_json:images[0].base64}]};}});t.after(()=>app.close());
 const first=await app.inject({url:'/api/session',headers:{host:'127.0.0.1:4173'}});
 const headers={host:'127.0.0.1:4173',origin:'http://127.0.0.1:4173',cookie:String(first.headers['set-cookie']).split(';')[0],'x-csrf-token':first.json().csrfToken};
 const config={baseUrl:'https://api.openai.com/v1',model:'fictional',apiKey:'FICTIONAL_IMAGE_PROXY_KEY',proxyCompatibility:true};
 assert.equal((await app.inject({method:'PUT',url:'/api/connections/image',headers,payload:{...config,baseUrl:'https://example.com'}})).statusCode,400);
 assert.equal((await app.inject({method:'PUT',url:'/api/connections/mcp',headers,payload:{baseUrl:config.baseUrl,apiKey:config.apiKey,proxyCompatibility:true}})).statusCode,400);
 assert.equal((await app.inject({method:'PUT',url:'/api/connections/image',headers,payload:config})).statusCode,200);
 const response=await app.inject({url:'/api/session',headers});const session=sessionSchema.parse(response.json());assert.equal(session.imageConnection?.proxyCompatibility,true);assert.ok(!response.body.includes(config.apiKey));
 const result=await app.inject({method:'POST',url:'/api/connections/image/test',headers,payload:{requestId:crypto.randomUUID(),connectionId:session.imageConnection!.id,multiple:false}});
 assert.equal(result.statusCode,200);assert.equal(enabled,true);
 assert.equal((await app.inject({url:'/api/session',headers})).json().connections.image,'connected');
 assert.equal((await app.inject({url:'/api/session',headers})).json().connections.text,'unavailable');
});
