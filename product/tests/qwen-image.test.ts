import test,{type TestContext} from 'node:test';
import assert from 'node:assert/strict';
import https from 'node:https';
import dns from 'node:dns/promises';
import {syncBuiltinESMExports} from 'node:module';
import {EventEmitter} from 'node:events';
import {createCanvas} from '@napi-rs/canvas';
import {editImage} from '../server/image-routes.js';
import {safeFetch} from '../server/network.js';
import {externalUrl,imageResultUrl} from '../server/network-policy.js';
import {qwenImageBaseUrl,portraitResultSchema,type ImageConnection} from '../shared/portrait-ai.js';
import {ConnectionError} from '../shared/connection-diagnostics.js';
import {LocalTextApi} from '../client/text-ai/api.js';
import {buildApp} from '../server/app.js';
import {sessionSchema} from '../shared/schemas.js';
import Yearbook from '../shared/yearbook-model.js';

const canvas=createCanvas(512,512);canvas.getContext('2d').fillRect(0,0,512,512);
const png=canvas.toBuffer('image/png'),image={base64:png.toString('base64'),width:512,height:512};
canvas.getContext('2d').fillStyle='#fff';canvas.getContext('2d').fillRect(0,0,512,512);
const reference={base64:canvas.toBuffer('image/png').toString('base64'),width:512,height:512};
const config:ImageConnection={provider:'qwen',baseUrl:qwenImageBaseUrl,model:'qwen-image-3.0',apiKey:'FICTIONAL_QWEN_SECRET'};

function network(t:TestContext){
 const state={status:200,body:undefined as unknown,url:'https://result.example.com/portrait.png?Expires=123&Signature=FICTIONAL_SIGNATURE',fakeApi:false,fakeDownload:false,download:'good',mime:'image/png',calls:[] as {url:URL;options:{headers:Record<string,string>;family:number;rejectUnauthorized?:boolean};body?:Buffer}[]};
 t.mock.method(dns,'lookup',async(host:string)=>[{address:host==='private.example.com'?'127.0.0.1':(host==='maas.qianwenaiapi.com'||host==='api.deepseek.com')&&state.fakeApi||host!=='maas.qianwenaiapi.com'&&host!=='api.deepseek.com'&&state.fakeDownload?'198.18.0.44':'8.8.8.8',family:4}]);
 t.mock.method(https,'request',(url:URL,options:typeof state.calls[number]['options'],callback:(res:unknown)=>void)=>{
  const req=new EventEmitter() as EventEmitter&{end:(body?:Buffer)=>void;destroy:()=>void};req.destroy=()=>{};
  req.end=body=>{
   state.calls.push({url,options,body});const api=url.hostname==='maas.qianwenaiapi.com'||url.hostname==='api.deepseek.com';
   const res=new EventEmitter() as EventEmitter&{statusCode:number;headers:Record<string,string>;destroy:()=>void};
   res.statusCode=api?state.status:state.download==='redirect'?302:state.download==='http'?503:200;
   res.headers={'content-type':api?'application/json':state.mime};res.destroy=()=>{};callback(res);
   const bytes=api?Buffer.from(JSON.stringify(url.hostname==='api.deepseek.com'?{choices:[{message:{content:'{\"ok\":true}'}}]}:state.body??{data:[{url:state.url}]})):state.download==='invalid'?Buffer.from('not a photo'):state.download==='large'?Buffer.alloc(15*1024*1024+1):png;
   queueMicrotask(()=>{res.emit('data',bytes);res.emit('end');});
  };
  queueMicrotask(()=>{const socket=new EventEmitter() as EventEmitter&{remoteAddress:string};socket.remoteAddress=(url.hostname==='maas.qianwenaiapi.com'||url.hostname==='api.deepseek.com')&&state.fakeApi||url.hostname!=='maas.qianwenaiapi.com'&&url.hostname!=='api.deepseek.com'&&state.fakeDownload?'198.18.0.44':'8.8.8.8';req.emit('socket',socket);socket.emit('secureConnect');});return req;
 });syncBuiltinESMExports();t.after(()=>{t.mock.restoreAll();syncBuiltinESMExports();});return state;
}

test('Qwen production adapter sends actual ordered references as JSON, downloads signed URL without credentials and returns decoded PNG',async t=>{
 const state=network(t),signal=new AbortController().signal;
 for(const model of ['qwen-image-3.0','qwen-image-3.0-pro']){
  const output=await editImage({...config,model,size:'2048x2048'},[image,reference],'图1为本人，图2只提供服装风格',signal) as {data:{b64_json:string}[]};
  assert.equal(output.data.length,1);assert.ok(Buffer.from(output.data[0].b64_json,'base64').subarray(0,8).equals(png.subarray(0,8)));
  const [api,download]=state.calls.slice(-2),body=JSON.parse(api.body!.toString());
  assert.equal(api.url.href,qwenImageBaseUrl+'/images/generations');assert.equal(api.options.headers.authorization,'Bearer '+config.apiKey);
  assert.equal(body.model,model);assert.equal(body.size,'2048x2048');assert.equal(body.n,1);assert.equal(body.prompt_extend,false);assert.deepEqual(body.image,[`data:image/png;base64,${image.base64}`,`data:image/png;base64,${reference.base64}`]);
  assert.equal(download.url.href,state.url);assert.deepEqual(download.options.headers,{});assert.equal(download.body,undefined);
  assert.equal(download.options.family,4);assert.notEqual(download.options.rejectUnauthorized,false);
 }
 state.calls.length=0;await editImage(config,[image],'保留图1主体',signal);assert.equal(typeof JSON.parse(state.calls[0].body!.toString()).image,'string');
});

test('Qwen signed result boundary preserves strict Base URLs and refuses private targets, redirects, non-images and oversize results with no retry',async t=>{
 const state=network(t),signal=new AbortController().signal;
 assert.throws(()=>externalUrl(state.url));assert.equal(imageResultUrl(state.url).search,'?Expires=123&Signature=FICTIONAL_SIGNATURE');
 for(const address of ['http://result.example.com/x','https://u:p@result.example.com/x','https://result.example.com:8443/x','https://result.example.com/x#fragment'])assert.throws(()=>imageResultUrl(address));
 await assert.rejects(safeFetch(state.url,{headers:{Authorization:'FICTIONAL_NOT_ALLOWED'}},1024,{imageResult:true}),/无凭据GET/);assert.equal(state.calls.length,0);
 for(const [url,mode,mime] of [
  ['https://private.example.com/x?Signature=NO','good','image/png'],
  [state.url,'redirect','image/png'],[state.url,'invalid','image/png'],[state.url,'large','image/png'],[state.url,'good','text/html'],[state.url,'http','image/png'],
 ] as const){
  state.url=url;state.download=mode;state.mime=mime;state.calls.length=0;
  await assert.rejects(editImage(config,[image],'STYLE',signal),error=>error instanceof ConnectionError&&error.diagnostic.code==='IMAGE_DOWNLOAD_FAILED'&&!error.message.includes('Signature'));
  assert.equal(state.calls.filter(call=>call.body).length,1);assert.equal(state.calls.length,url.includes('private')?1:2);
 }
});

test('Qwen rejects unsupported input before HTTP and classifies bounded upstream errors without exposing provider messages or keys',async t=>{
 const state=network(t),signal=new AbortController().signal;
 for(const invalid of [{...image,width:9000},{...image,width:6000,height:20},{...image,base64:Buffer.alloc(10*1024*1024+1).toString('base64')}])await assert.rejects(editImage(config,[invalid],'STYLE',signal),/10MB/);
 assert.equal(state.calls.length,0);
 for(const [status,code,expected] of [[401,'InvalidApiKey','AUTH_FAILED'],[403,'AccessDenied','FORBIDDEN'],[429,'Throttling','RATE_LIMITED'],[400,'InsufficientBalance','QUOTA_EXHAUSTED'],[400,'DataInspectionFailed','CONTENT_REJECTED'],[429,'Unknown','RATE_OR_QUOTA']] as const){
  state.status=status;state.body={error:{code,message:config.apiKey}};state.calls.length=0;
  await assert.rejects(editImage(config,[image],'STYLE',signal),error=>error instanceof ConnectionError&&error.diagnostic.code===expected&&!error.message.includes(config.apiKey));assert.equal(state.calls.length,1);
 }
 state.status=200;state.body={data:[{url:'https://result.example.com/x?key='+config.apiKey}]};state.calls.length=0;
 await assert.rejects(editImage(config,[image],'STYLE',signal),/凭据/);assert.equal(state.calls.length,1);
 state.body={data:[]};await assert.rejects(editImage(config,[image],'STYLE',signal),/单张图片/);
});

test('Qwen config→real adapter probes→candidate route retains independent credentials and confirmation metadata',async t=>{
 const state=network(t),app=await buildApp(false);t.after(()=>app.close());
 const api=new LocalTextApi(async(path,init)=>{
  const response=await app.inject({url:String(path),method:(init?.method??'GET') as 'GET'|'POST'|'PUT',headers:{host:'127.0.0.1:4173',origin:'http://127.0.0.1:4173',...headers,...Object.fromEntries(new Headers(init?.headers))},...(init?.body?{payload:String(init.body)}:{})});
  if(response.headers['set-cookie'])headers.cookie=String(response.headers['set-cookie']).split(';')[0];return new Response(response.body,{status:response.statusCode});
 });const headers:Record<string,string>={};
 await api.saveAndVerify('image',config,crypto.randomUUID(),true);
 const session=sessionSchema.parse(await api.session());assert.equal(session.connections.image,'connected');assert.equal(session.imageConnection?.provider,'qwen');assert.equal(session.imageConnection?.size,'1024x1024');assert.equal(session.connections.text,'unavailable');assert.ok(!JSON.stringify(session).includes(config.apiKey));
 assert.deepEqual(state.calls.filter(call=>call.body).map(call=>{const refs=JSON.parse(call.body!.toString()).image;return Array.isArray(refs)?refs.length:1;}),[1,2]);
 const y=Yearbook.normalize(),payload={connectionId:session.imageConnection!.id,requestId:crypto.randomUUID(),documentId:crypto.randomUUID(),baseRevision:7,sourceAssetId:crypto.randomUUID(),style:'yearbook-female',options:{presentation:y.presentation,outfit:y.outfit,hair:y.hair,retouch:y.retouch,background:y.background},images:[{base64:image.base64,mime:'image/png'}]};
 const result=await api.write('/api/ai/portrait',payload) as {baseRevision:number;sourceAssetId:string;image:{width:number}};assert.equal(result.baseRevision,7);assert.equal(result.sourceAssetId,payload.sourceAssetId);assert.equal(result.image.width,512);
 for(const invalid of [{...config,baseUrl:'https://other.example.com/v1'},{...config,model:'other'},{...config,provider:'openai',proxyCompatibility:true}])await assert.rejects(api.write('/api/connections/image',invalid,'PUT'));
 await assert.rejects(api.write('/api/connections/text',{baseUrl:qwenImageBaseUrl,model:config.model,apiKey:config.apiKey,proxyCompatibility:true},'PUT'));
 assert.equal((await api.session()).connections.text,'unavailable');
});

test('fresh configuration check refuses different image service or size before any paid test',async()=>{
 let tested=false;const id=crypto.randomUUID();const api=new LocalTextApi(async(path)=>{
  if(String(path).endsWith('/test'))tested=true;
  return new Response(JSON.stringify(String(path)==='/api/session'?{csrfToken:'a'.repeat(64),connections:{text:'unavailable',image:'configured',mcp:'disabled'},imageConnection:{id,baseUrl:qwenImageBaseUrl,model:config.model,provider:'qwen',size:'2048x2048',capabilities:{single:false,multiple:false}}}:{}),{status:200});
 });
 for(const sent of [config,{...config,provider:'openai' as const,size:'2048x2048' as const},{...config,size:'2048x2048' as const,resultProxyCompatibility:true}])await assert.rejects(api.saveAndVerify('image',sent,crypto.randomUUID()),/下载设置已变化/);assert.equal(tested,false);
});

test('Qwen official API proxy opt-in permits only its Fake-IP mapping; result downloads never inherit trust',async t=>{
 const state=network(t),signal=new AbortController().signal;state.fakeApi=true;
 await assert.rejects(editImage(config,[image],'STYLE',signal),error=>error instanceof ConnectionError&&error.diagnostic.code==='TARGET_REJECTED');assert.equal(state.calls.length,0);
 await editImage({...config,proxyCompatibility:true},[image],'STYLE',signal);assert.equal(state.calls.length,2);
 state.fakeDownload=true;state.calls.length=0;
 await assert.rejects(editImage({...config,proxyCompatibility:true},[image],'STYLE',signal),error=>error instanceof ConnectionError&&error.diagnostic.code==='IMAGE_DOWNLOAD_FAILED');assert.equal(state.calls.length,1);
});

test('explicit Qwen result proxy flag only permits documented exact result hosts, with no credentials and an accurate failure cause',async t=>{
 const state=network(t),signal=new AbortController().signal;state.fakeDownload=true;
 const trustedHosts=['dashscope-result.oss-cn-shanghai.aliyuncs.com','dashscope-result-sz.oss-cn-shenzhen.aliyuncs.com','dashscope-a717.oss-accelerate.aliyuncs.com'];
 for(const host of trustedHosts){
  state.url=`https://${host}/result.png?Signature=FICTIONAL_SIGN`;state.calls.length=0;
  await assert.rejects(editImage(config,[image],'STYLE',signal),error=>error instanceof ConnectionError&&error.diagnostic.code==='IMAGE_DOWNLOAD_FAILED'&&error.diagnostic.causeCode==='TARGET_REJECTED'&&error.diagnostic.stage==='network'&&error.diagnostic.targetHost===host);
  assert.equal(state.calls.length,1);
  await editImage({...config,resultProxyCompatibility:true},[image],'STYLE',signal);assert.deepEqual(state.calls.at(-1)!.options.headers,{});assert.equal(state.calls.at(-1)!.options.family,4);
 }
 for(const host of ['other.oss-accelerate.aliyuncs.com','dashscope-a717.oss-accelerate.aliyuncs.com.evil.example','other.oss-cn-shanghai.aliyuncs.com','dashscope-result.oss-cn-shanghai.aliyuncs.com.evil.example','result.example.com']){
  state.url=`https://${host}/result.png?Signature=FICTIONAL_SIGN`;state.calls.length=0;
  await assert.rejects(editImage({...config,resultProxyCompatibility:true},[image],'STYLE',signal),error=>error instanceof ConnectionError&&error.diagnostic.causeCode==='TARGET_REJECTED');assert.equal(state.calls.length,1);
 }
});

test('download error details survive LocalTextApi without paths, signatures or keys; decode failures are distinguished',async t=>{
 const state=network(t),app=await buildApp(false);t.after(()=>app.close());
 const first=await app.inject({url:'/api/session',headers:{host:'127.0.0.1:4173'}}),headers={host:'127.0.0.1:4173',origin:'http://127.0.0.1:4173',cookie:String(first.headers['set-cookie']).split(';')[0],'x-csrf-token':first.json().csrfToken};
 state.fakeDownload=true;state.url='https://dashscope-result.oss-cn-shanghai.aliyuncs.com/private-photo.png?Signature=NEVER_IN_ERROR';
 await app.inject({method:'PUT',url:'/api/connections/image',headers,payload:config});
 const session=(await app.inject({url:'/api/session',headers})).json();
 const failure=await app.inject({method:'POST',url:'/api/connections/image/test',headers,payload:{connectionId:session.imageConnection.id,requestId:crypto.randomUUID(),multiple:false}});
 assert.equal(failure.statusCode,502);assert.equal(failure.json().diagnostic.causeCode,'TARGET_REJECTED');assert.equal(failure.json().diagnostic.stage,'network');
 for(const secret of [config.apiKey,'NEVER_IN_ERROR','private-photo.png'])assert.ok(!failure.body.includes(secret));
 const api=new LocalTextApi(async(path)=>String(path)==='/api/session'?new Response(JSON.stringify({csrfToken:'a'.repeat(64),connections:{text:'unavailable',image:'failed',mcp:'disabled'}})):new Response(failure.body,{status:502}));
 await assert.rejects(api.write('/test'),error=>error instanceof Error&&error.message.includes('原因 TARGET_REJECTED')&&error.message.includes('目标域名 dashscope-result.oss-cn-shanghai.aliyuncs.com'));
 state.fakeDownload=false;state.download='invalid';
 await assert.rejects(editImage(config,[image],'STYLE',new AbortController().signal),error=>error instanceof ConnectionError&&error.diagnostic.causeCode==='IMAGE_DECODE_FAILED');
 state.download='good';state.mime='text/html';
 await assert.rejects(editImage(config,[image],'STYLE',new AbortController().signal),error=>error instanceof ConnectionError&&error.diagnostic.causeCode==='RESPONSE_FORMAT');
 for(const invalid of [{...config,provider:'openai',resultProxyCompatibility:true},{baseUrl:config.baseUrl,model:config.model,apiKey:config.apiKey,resultProxyCompatibility:true}])assert.equal((await app.inject({method:'PUT',url:'/api/connections/image',headers,payload:invalid})).statusCode,400);
});

async function localApi(t:TestContext){
 const app=await buildApp(false);t.after(()=>app.close());let cookie='';
 return new LocalTextApi(async(path,init)=>{
  const response=await app.inject({url:String(path),method:(init?.method??'GET') as 'GET'|'POST'|'PUT'|'DELETE',headers:{host:'127.0.0.1:4173',origin:'http://127.0.0.1:4173',...(cookie?{cookie}:{}),...Object.fromEntries(new Headers(init?.headers))},...(init?.body?{payload:String(init.body)}:{})});
  if(response.headers['set-cookie'])cookie=String(response.headers['set-cookie']).split(';')[0];return new Response(response.body,{status:response.statusCode});
 });
}

test('VPN workflow simulation: DeepSeek and Qwen verified before new portrait task, then failed download resumes without a second generation',async t=>{
 const state=network(t);state.fakeApi=true;state.fakeDownload=true;state.url='https://dashscope-a717.oss-accelerate.aliyuncs.com/photo.png?Signature=NOT_IN_SESSION';
 const api=await localApi(t);
 await api.saveAndVerify('text',{baseUrl:'https://api.deepseek.com',model:'deepseek-flash',apiKey:'FICTIONAL_DS_KEY',proxyCompatibility:true},crypto.randomUUID());
 await api.saveAndVerify('image',{...config,proxyCompatibility:true,resultProxyCompatibility:true},crypto.randomUUID());
 let session=await api.session();assert.equal(session.connections.text,'connected');assert.equal(session.connections.image,'connected');assert.deepEqual(session.imageConnection?.check,{network:'passed',generation:'passed',download:'passed',referenceCount:1});
 assert.equal(state.calls.filter(call=>call.url.pathname.endsWith('/images/generations')).length,1);
 const y=Yearbook.normalize(),input={connectionId:session.imageConnection!.id,requestId:crypto.randomUUID(),documentId:crypto.randomUUID(),baseRevision:8,sourceAssetId:crypto.randomUUID(),style:'sky',options:{presentation:y.presentation,outfit:y.outfit,hair:y.hair,retouch:y.retouch,background:y.background},images:[{base64:image.base64,mime:'image/png'}]};
 state.download='http';await assert.rejects(api.write('/api/ai/portrait',input),/IMAGE_DOWNLOAD_FAILED/);
 session=await api.session();const pending=session.imageConnection!.pendingDownload!;assert.equal(pending.kind,'portrait');assert.equal(pending.portrait!.baseRevision,8);
 assert.ok(!JSON.stringify(session).includes('Signature'));assert.ok(!JSON.stringify(session).includes('NOT_IN_SESSION'));assert.ok(!JSON.stringify(session).includes(config.apiKey));
 const paidCalls=state.calls.filter(call=>call.body).length;state.download='good';
 const recovered=portraitResultSchema.parse(await api.write('/api/connections/image/retry-download',{connectionId:session.imageConnection!.id,pendingId:pending.id,requestId:crypto.randomUUID(),vpnCompatibility:true}));
 assert.equal(recovered.requestId,input.requestId);assert.equal(recovered.baseRevision,8);assert.equal(recovered.sourceAssetId,input.sourceAssetId);assert.equal(recovered.image.width,512);assert.equal(state.calls.filter(call=>call.body).length,paidCalls);
 assert.equal((await api.session()).imageConnection?.pendingDownload,undefined);
});

test('VPN workflow simulation: network failure stops before paid text/image capability calls',async t=>{
 const state=network(t);state.fakeApi=true;const api=await localApi(t);
 await assert.rejects(api.saveAndVerify('text',{baseUrl:'https://api.deepseek.com',model:'deepseek-flash',apiKey:'FICTIONAL_DS_KEY'},crypto.randomUUID()),/TARGET_REJECTED/);
 await assert.rejects(api.saveAndVerify('image',config,crypto.randomUUID()),/TARGET_REJECTED/);
 assert.equal(state.calls.length,0);const session=await api.session();assert.equal(session.connections.text,'failed');assert.equal(session.connections.image,'failed');assert.equal(session.imageConnection?.check?.network,'failed');
});

test('VPN workflow simulation: test download retry verifies only completed capability, expires after 15 minutes and is cleared on reconfiguration',async t=>{
 const state=network(t),api=await localApi(t);let now=Date.now();t.mock.method(Date,'now',()=>now);
 state.url='https://dashscope-result.oss-cn-shanghai.aliyuncs.com/test.png?Signature=SECRET_URL';state.fakeDownload=true;
 await api.write('/api/connections/image',config,'PUT');let session=await api.session();const id=session.imageConnection!.id;
 await assert.rejects(api.write('/api/connections/image/test',{connectionId:id,requestId:crypto.randomUUID(),multiple:true}),/IMAGE_DOWNLOAD_FAILED/);
 session=await api.session();const pending=session.imageConnection!.pendingDownload!;assert.equal(pending.kind,'test');assert.deepEqual(session.imageConnection?.check,{network:'idle',generation:'passed',download:'failed',referenceCount:1});
 const count=state.calls.filter(call=>call.body).length;
 await api.write('/api/connections/image/retry-download',{connectionId:id,pendingId:pending.id,requestId:crypto.randomUUID(),vpnCompatibility:true});
 session=await api.session();assert.equal(session.connections.image,'connected');assert.deepEqual(session.imageConnection!.capabilities,{single:true,multiple:false});assert.equal(state.calls.filter(call=>call.body).length,count);
 state.download='http';await assert.rejects(api.write('/api/connections/image/test',{connectionId:id,requestId:crypto.randomUUID(),multiple:false}),/IMAGE_DOWNLOAD_FAILED/);
 session=await api.session();const oldPending=session.imageConnection!.pendingDownload!;now+=15*60*1000+1;
 const before=state.calls.length;await assert.rejects(api.write('/api/connections/image/retry-download',{connectionId:id,pendingId:oldPending.id,requestId:crypto.randomUUID(),vpnCompatibility:true}),/过期/);assert.equal(state.calls.length,before);
 await api.write('/api/connections/image',config,'PUT');
 await assert.rejects(api.write('/api/connections/image/retry-download',{connectionId:id,pendingId:oldPending.id,requestId:crypto.randomUUID(),vpnCompatibility:true}),/没有可继续/);
});

test('no-key network check uses current explicit VPN intent, reports effective mode and cannot save keys or call a paid model',async t=>{
 const state=network(t),api=await localApi(t);state.fakeApi=true;state.fakeDownload=true;
 await assert.rejects(api.write('/api/network/check',{service:'qwen',vpnCompatibility:false}),error=>error instanceof Error&&error.message.includes('VPN兼容未开启'));
 assert.equal(state.calls.length,0);
 const result=await api.write('/api/network/check',{service:'qwen',vpnCompatibility:true}) as {vpnCompatibility:boolean;checks:{host:string}[]};
 assert.equal(result.vpnCompatibility,true);assert.equal(result.checks.length,4);assert.ok(result.checks.some((check:{host:string})=>check.host==='dashscope-a717.oss-accelerate.aliyuncs.com'));assert.ok(state.calls.every(call=>!call.body&&!call.options.headers.authorization));
 const session=await api.session();assert.deepEqual(session.connections,{text:'unavailable',image:'unavailable',mcp:'disabled'});assert.equal(session.imageConnection,undefined);
 const count=state.calls.length;
 for(const input of [{service:'qwen',vpnCompatibility:true,apiKey:'FICTIONAL_REJECTED_KEY'},{service:'custom',vpnCompatibility:true},{service:'qwen',vpnCompatibility:true,url:'https://127.0.0.1'}])await assert.rejects(api.write('/api/network/check',input));
 assert.equal(state.calls.length,count);
});


test('Fixed template route uses template as image 1, identity as image 2, portrait size and negative prompt; ordinary editing unchanged',async t=>{
 const state=network(t),api=await localApi(t);
 await api.saveAndVerify('image',config,crypto.randomUUID(),true);const session=await api.session();
 const y=Yearbook.normalize(),options={presentation:y.presentation,outfit:y.outfit,hair:y.hair,retouch:y.retouch,background:y.background};
 const c=createCanvas(720,960);c.getContext('2d').fillStyle='#abcdef';c.getContext('2d').fillRect(0,0,720,960);const template=c.toBuffer('image/png').toString('base64');
 const payload={connectionId:session.imageConnection!.id,requestId:crypto.randomUUID(),documentId:crypto.randomUUID(),baseRevision:3,sourceAssetId:crypto.randomUUID(),templateDigest:'b'.repeat(64),style:'template-female',options,images:[{base64:image.base64,mime:'image/png'},{base64:template,mime:'image/png'}]};
 await api.write('/api/ai/portrait',payload);
 const body=JSON.parse(state.calls.filter(c=>c.body).at(-1)!.body!.toString());
 assert.equal(body.size,'886x1182');assert.match(body.prompt,/图1.*模板/);assert.match(body.prompt,/图2.*身份/);assert.match(body.negative_prompt,/图2的服装/);
 const decoded=await import('../server/image-codec.js');const normalized=await decoded.normalizeImage({base64:template,mime:'image/png'},new AbortController().signal);
 assert.equal(body.image[0],`data:image/png;base64,${normalized.base64}`);
 await api.write('/api/ai/portrait',{...payload,requestId:crypto.randomUUID(),images:[payload.images[0],payload.images[0]]});
 const square=JSON.parse(state.calls.filter(c=>c.body).at(-1)!.body!.toString());assert.equal(square.size,'1024x1024');
 await api.write('/api/ai/portrait',{...payload,style:'sky',templateDigest:undefined,images:payload.images.slice(0,1),requestId:crypto.randomUUID()});
 const ordinary=JSON.parse(state.calls.filter(c=>c.body).at(-1)!.body!.toString());assert.equal(ordinary.size,'1024x1024');assert.equal(ordinary.negative_prompt,undefined);assert.equal(typeof ordinary.image,'string');
 await api.saveAndVerify('image',{...config,size:'2048x2048'},crypto.randomUUID(),true);const high=await api.session();
 await api.write('/api/ai/portrait',{...payload,connectionId:high.imageConnection!.id,requestId:crypto.randomUUID()});
 const highBody=JSON.parse(state.calls.filter(c=>c.body).at(-1)!.body!.toString());assert.equal(highBody.size,'1536x2048');
});
