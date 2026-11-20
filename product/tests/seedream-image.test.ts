import test,{type TestContext} from 'node:test';
import assert from 'node:assert/strict';
import https from 'node:https';
import dns from 'node:dns/promises';
import {syncBuiltinESMExports} from 'node:module';
import {EventEmitter} from 'node:events';
import {createCanvas} from '@napi-rs/canvas';
import {editImage} from '../server/image-routes.js';
import {resolveTarget,assertRemote} from '../server/network-policy.js';
import {checkConnectionNetwork} from '../server/connection-network.js';
import {seedreamImageBaseUrl,seedreamDefaultModel,seedreamFlashModel,isBase64Text,imagePayloadSchema,type ImageConnection} from '../shared/portrait-ai.js';
import {ConnectionError} from '../shared/connection-diagnostics.js';
import {buildApp} from '../server/app.js';
const canvas=createCanvas(512,512),png=canvas.toBuffer('image/png'),jpeg=canvas.toBuffer('image/jpeg');
const image={base64:png.toString('base64'),width:512,height:512};
const config:ImageConnection={provider:'seedream',baseUrl:seedreamImageBaseUrl,model:seedreamDefaultModel,apiKey:'FICTIONAL_SEEDREAM_SECRET',size:'2048x2048',proxyCompatibility:true};
function network(t:TestContext){
 const state={address:'198.18.0.22',remote:'198.18.0.22',status:200,body:{data:[{b64_json:image.base64}]} as unknown,calls:[] as {url:URL;options:{headers:Record<string,string>;rejectUnauthorized?:boolean};body?:Buffer}[]};
 t.mock.method(dns,'lookup',async()=>[{address:state.address,family:4}]);
 t.mock.method(https,'request',(url:URL,options:typeof state.calls[number]['options'],callback:(response:unknown)=>void)=>{
  const req=new EventEmitter() as EventEmitter&{end:(body?:Buffer)=>void;destroy:()=>void};req.destroy=()=>{};
  req.end=body=>{state.calls.push({url,options,body});const res=new EventEmitter() as EventEmitter&{statusCode:number;headers:Record<string,string>;destroy:()=>void};res.statusCode=state.status;res.headers={'content-type':'application/json'};res.destroy=()=>{};callback(res);queueMicrotask(()=>{res.emit('data',Buffer.from(JSON.stringify(state.body)));res.emit('end');});};
  queueMicrotask(()=>{const socket=new EventEmitter() as EventEmitter&{remoteAddress:string};socket.remoteAddress=state.remote;req.emit('socket',socket);socket.emit('secureConnect');});return req;
 });syncBuiltinESMExports();t.after(()=>{t.mock.restoreAll();syncBuiltinESMExports();});return state;
}
const signal=()=>new AbortController().signal;
test('Seedream actual JSON protocol: ordered references, Base64, PNG normalization and no URL request',async t=>{
 const n=network(t);let received=0;
 const result=await editImage(config,[image,image],'只编辑图1，以图2为本人面部依据',signal(),()=>{throw new Error('URL callback');},{size:'1773x2364'},()=>{received++;}) as {data:{b64_json:string}[]};
 assert.equal(n.calls.length,1);assert.equal(received,1);const req=n.calls[0],body=JSON.parse(req.body!.toString());
 assert.equal(req.url.href,seedreamImageBaseUrl+'/images/generations');assert.equal(req.options.headers.authorization,'Bearer '+config.apiKey);assert.notEqual(req.options.rejectUnauthorized,false);
 assert.deepEqual(body.image,[`data:image/png;base64,${image.base64}`,`data:image/png;base64,${image.base64}`]);assert.equal(body.response_format,'b64_json');assert.equal(body.output_format,'png');assert.equal(body.watermark,false);assert.equal(body.stream,false);assert.equal(body.size,'1773x2364');
 for(const key of ['n','prompt_extend','negative_prompt','sequential_image_generation','tools'])assert.equal(key in body,false);
 assert.ok(Buffer.from(result.data[0].b64_json,'base64').subarray(0,8).equals(png.subarray(0,8)));
 n.body={data:[{b64_json:jpeg.toString('base64')}]};const converted=await editImage(config,[image],'STYLE',signal()) as typeof result;assert.equal(JSON.parse(n.calls[1].body!.toString()).size,'2048x2048');assert.equal(typeof JSON.parse(n.calls[1].body!.toString()).image,'string');assert.ok(Buffer.from(converted.data[0].b64_json,'base64').subarray(0,8).equals(png.subarray(0,8)));
});
test('Seedream VPN: official API fake IP only, remote pinning, strict private and result hosts',async t=>{
 const n=network(t);
 await assert.rejects(editImage({...config,proxyCompatibility:false},[image],'STYLE',signal()),e=>e instanceof ConnectionError&&e.diagnostic.code==='TARGET_REJECTED');assert.equal(n.calls.length,0);
 await checkConnectionNetwork(config,signal());assert.equal(n.calls.length,1);assert.equal(n.calls[0].url.pathname,'/api/v3/models');assert.deepEqual(n.calls[0].options.headers,{});
 for(const host of ['evil.volces.com','ark.cn-beijing.volces.com.evil.example','127.0.0.1'])await assert.rejects(resolveTarget(new URL('https://'+host),undefined,true));
 await assert.rejects(resolveTarget(new URL(seedreamImageBaseUrl),undefined,true,true));
 for(const address of ['127.0.0.1','10.1.1.1','169.254.169.254','100.64.0.1'])await assert.rejects(resolveTarget(new URL(seedreamImageBaseUrl),async()=>[{address,family:4}],true));
 assert.throws(()=>assertRemote('198.18.0.23','198.18.0.22',true));
 n.remote='198.18.0.23';await assert.rejects(editImage(config,[image],'STYLE',signal()),e=>e instanceof ConnectionError&&e.diagnostic.code==='TARGET_REJECTED');assert.equal(n.calls.length,1);
});
test('Seedream bounded error handling: no retry, URL fallback or secret disclosure',async t=>{
 const n=network(t);
 for(const [status,body,code] of [[401,{error:{code:'InvalidApiKey',message:config.apiKey}},'AUTH_FAILED'],[403,{},'FORBIDDEN'],[404,{},'ENDPOINT_NOT_FOUND'],[404,{error:{code:'ModelNotOpen'}},'MODEL_NOT_OPEN'],[404,{error:{code:'InvalidEndpointOrModel.NotFound'}},'ENDPOINT_NOT_FOUND'],[429,{},'RATE_OR_QUOTA'],[429,{error:{code:'RateLimitExceeded'}},'RATE_LIMITED'],[400,{error:{code:'QuotaExceeded'}},'QUOTA_EXHAUSTED'],[500,{},'UPSTREAM_ERROR'],[302,{},'REDIRECT_REJECTED'],[200,{data:[{url:'https://private.example/secret'}]},'RESPONSE_FORMAT'],[200,{data:[]},'RESPONSE_FORMAT'],[200,{data:[{b64_json:'aW52YWxpZA=='}]},'RESPONSE_FORMAT']] as const){n.status=status;n.body=body;const before=n.calls.length;await assert.rejects(editImage(config,[image],'STYLE',signal()),e=>e instanceof ConnectionError&&e.diagnostic.code===code&&!e.message.includes(config.apiKey));assert.equal(n.calls.length,before+1);}
 n.status=200;n.body={data:[{b64_json:png.subarray(0,16).toString('base64')}]};await assert.rejects(editImage(config,[image],'STYLE',signal()),e=>e instanceof ConnectionError&&e.diagnostic.code==='IMAGE_DOWNLOAD_FAILED');
 const before=n.calls.length;await assert.rejects(editImage(config,[{...image,width:14}],'STYLE',signal()),/14像素/);assert.equal(n.calls.length,before);
});
test('Seedream real routes: credentials stay server-side, dual probes, template aspect, generation/decode diagnostics',async t=>{
 const n=network(t),app=await buildApp();t.after(()=>app.close());
 const session=await app.inject({url:'/api/session',headers:{host:'127.0.0.1:4173'}}),headers={host:'127.0.0.1:4173',origin:'http://127.0.0.1:4173',cookie:String(session.headers['set-cookie']).split(';')[0],'x-csrf-token':session.json().csrfToken};
 const save=await app.inject({method:'PUT',url:'/api/connections/image',headers,payload:config});assert.equal(save.statusCode,200,save.body);assert.equal(n.calls.length,0);
 let current=(await app.inject({url:'/api/session',headers})).json();assert.equal(current.imageConnection.provider,'seedream');assert.ok(!JSON.stringify(current).includes(config.apiKey));
 const id=current.imageConnection.id;
 const probe=await app.inject({method:'POST',url:'/api/connections/image/test',headers,payload:{connectionId:id,requestId:crypto.randomUUID(),multiple:true}});assert.equal(probe.statusCode,200,probe.body);assert.equal(n.calls.length,2);
 const template=createCanvas(720,960).toBuffer('image/png');
 const portrait=await app.inject({method:'POST',url:'/api/ai/portrait',headers,payload:{connectionId:id,requestId:crypto.randomUUID(),documentId:crypto.randomUUID(),baseRevision:1,sourceAssetId:crypto.randomUUID(),templateDigest:'a'.repeat(64),style:'template-female',options:{presentation:'female',outfit:'college',hair:'styled',retouch:'natural',background:'bluegray'},images:[{base64:image.base64,mime:'image/png'},{base64:template.toString('base64'),mime:'image/png'}]}});
 assert.equal(portrait.statusCode,200,portrait.body);const sent=JSON.parse(n.calls.at(-1)!.body!.toString());assert.equal(sent.image[0],`data:image/png;base64,${template.toString('base64')}`);const [w,h]=sent.size.split('x').map(Number);assert.ok(Math.abs(w/h-.75)<.001);assert.ok(w*h>=3686400&&w*h<=4624220);
 n.body={data:[{b64_json:png.subarray(0,16).toString('base64')}]};const failure=await app.inject({method:'POST',url:'/api/connections/image/test',headers,payload:{connectionId:id,requestId:crypto.randomUUID(),multiple:false}});assert.equal(failure.statusCode,502);current=(await app.inject({url:'/api/session',headers})).json();assert.equal(current.imageConnection.check.generation,'passed');assert.equal(current.imageConnection.check.download,'failed');assert.equal(current.imageConnection.pendingDownload,undefined);assert.equal(current.connections.image,'failed');
 for(const bad of [{...config,baseUrl:'https://evil.example/api/v3'},{...config,model:'doubao-seedream-3-0-unknown'},{...config,resultProxyCompatibility:true}])assert.equal((await app.inject({method:'PUT',url:'/api/connections/image',headers,payload:bad})).statusCode,400);
});
test('巨型base64线性校验：2K图重编码规模（旧分组正则在此规模深栈下RangeError崩溃进程）',()=>{
 const valid='QUJD'.repeat(2*1024*1024-1)+'AA==';
 assert.equal(valid.length%4,0);assert.equal(isBase64Text(valid),true);
 assert.equal(imagePayloadSchema.safeParse({base64:valid,mime:'image/png'}).success,true);
 assert.equal(isBase64Text(valid+'A'),false);
 assert.equal(isBase64Text('QUJD'.repeat(2*1024*1024-1)+'A!=='),false);
 assert.equal(isBase64Text('A'.repeat(8*1024*1024-3)+'==='),false);
 assert.equal(isBase64Text('QU=D'.repeat(2)),false);
 assert.equal(imagePayloadSchema.safeParse({base64:'abc',mime:'image/png'}).success,false);
});

test('Two image probes reset progress for round two, allow six minutes overall and mark cancellation incomplete',async t=>{
 let calls=0,release!:()=>void,started!:()=>void;let ready=new Promise<void>(resolve=>{started=resolve;});
 const app=await buildApp(false,undefined,{image:async()=>{calls++;if(calls%2===0){started();await new Promise<void>(resolve=>{release=resolve;});}return {data:[{b64_json:image.base64}]};}});t.after(()=>app.close());
 const session=await app.inject({url:'/api/session',headers:{host:'127.0.0.1:4173'}}),headers={host:'127.0.0.1:4173',origin:'http://127.0.0.1:4173',cookie:String(session.headers['set-cookie']).split(';')[0],'x-csrf-token':session.json().csrfToken};
 await app.inject({method:'PUT',url:'/api/connections/image',headers,payload:config});const id=(await app.inject({url:'/api/session',headers})).json().imageConnection.id;
 const delays:number[]=[],nativeTimeout=setTimeout;t.mock.method(globalThis,'setTimeout',(...args:Parameters<typeof setTimeout>)=>{delays.push(Number(args[1]));return nativeTimeout(...args);});
 let requestId=crypto.randomUUID();const pending=app.inject({method:'POST',url:'/api/connections/image/test',headers,payload:{connectionId:id,requestId,multiple:true}});void pending.then(()=>{});await ready;
 let state=(await app.inject({url:'/api/session',headers})).json();assert.equal(state.imageConnection.check.referenceCount,2);assert.equal(state.imageConnection.check.generation,'running');assert.equal(state.imageConnection.check.download,'idle');assert.equal(state.connections.image,'configured');assert.ok(delays.includes(360000));
 release();assert.equal((await pending).statusCode,200);state=(await app.inject({url:'/api/session',headers})).json();assert.equal(state.imageConnection.capabilities.multiple,true);assert.equal(state.imageConnection.check.download,'passed');
 ready=new Promise<void>(resolve=>{started=resolve;});requestId=crypto.randomUUID();const cancelled=app.inject({method:'POST',url:'/api/connections/image/test',headers,payload:{connectionId:id,requestId,multiple:true}});void cancelled.then(()=>{});await ready;
 await app.inject({method:'POST',url:'/api/ai/portrait/cancel',headers,payload:{requestId}});release();assert.equal((await cancelled).statusCode,499);
 state=(await app.inject({url:'/api/session',headers})).json();assert.equal(state.connections.image,'failed');assert.equal(state.imageConnection.check.referenceCount,2);assert.equal(state.imageConnection.check.generation,'failed');assert.equal(state.imageConnection.capabilities.multiple,false);
});

test('Seedream authentication lists models only, never generates and does not imply model entitlement',async t=>{
 const n=network(t);n.body={data:[{id:seedreamDefaultModel},{id:'OTHER_MODEL_NOT_FOR_CLIENT'}]};
 const app=await buildApp();t.after(()=>app.close());
 const session=await app.inject({url:'/api/session',headers:{host:'127.0.0.1:4173'}}),headers={host:'127.0.0.1:4173',origin:'http://127.0.0.1:4173',cookie:String(session.headers['set-cookie']).split(';')[0],'x-csrf-token':session.json().csrfToken};
 await app.inject({method:'PUT',url:'/api/connections/image',headers,payload:config});const id=(await app.inject({url:'/api/session',headers})).json().imageConnection.id;
 const auth=await app.inject({method:'POST',url:'/api/connections/image/auth',headers,payload:{connectionId:id,requestId:crypto.randomUUID()}});assert.equal(auth.statusCode,200,auth.body);assert.equal(auth.json().modelListed,true);assert.match(auth.json().verified,/不代表账号已开通/);
 assert.equal(n.calls.length,1);assert.equal(n.calls[0].url.pathname,'/api/v3/models');assert.equal(n.calls[0].body,undefined);assert.equal(n.calls[0].options.headers.authorization,'Bearer '+config.apiKey);assert.ok(!auth.body.includes('OTHER_MODEL_NOT_FOR_CLIENT'));
 const state=(await app.inject({url:'/api/session',headers})).json();assert.equal(state.connections.image,'connected');assert.equal(state.imageConnection.credentialsVerified,true);assert.equal(state.imageConnection.modelListed,true);assert.deepEqual(state.imageConnection.capabilities,{single:false,multiple:false});assert.ok(!JSON.stringify(state).includes(config.apiKey));
 n.status=401;const failed=await app.inject({method:'POST',url:'/api/connections/image/auth',headers,payload:{connectionId:id,requestId:crypto.randomUUID()}});assert.equal(failed.json().diagnostic.code,'AUTH_FAILED');assert.equal((await app.inject({url:'/api/session',headers})).json().imageConnection.credentialsVerified,undefined);
});

test('Seedream background job returns early, generates once, survives status polling and records only actual dual capability',async t=>{
 const n=network(t);n.body={data:[{id:seedreamDefaultModel}]};let count=0,release!:()=>void,started!:()=>void;const ready=new Promise<void>(resolve=>{started=resolve;});
 const app=await buildApp(false,undefined,{image:async(_config,images,_prompt,_signal,_generated,_options,received)=>{count++;assert.equal(images.length,2);started();await new Promise<void>(resolve=>{release=resolve;});received?.();return {data:[{b64_json:image.base64}]};}});t.after(()=>app.close());
 const session=await app.inject({url:'/api/session',headers:{host:'127.0.0.1:4173'}}),headers={host:'127.0.0.1:4173',origin:'http://127.0.0.1:4173',cookie:String(session.headers['set-cookie']).split(';')[0],'x-csrf-token':session.json().csrfToken};
 await app.inject({method:'PUT',url:'/api/connections/image',headers,payload:config});const connectionId=(await app.inject({url:'/api/session',headers})).json().imageConnection.id;
 await app.inject({method:'POST',url:'/api/connections/image/auth',headers,payload:{connectionId,requestId:crypto.randomUUID()}});
 const input={connectionId,requestId:crypto.randomUUID(),documentId:crypto.randomUUID(),baseRevision:1,sourceAssetId:crypto.randomUUID(),templateDigest:'b'.repeat(64),style:'template-female',options:{presentation:'female',outfit:'college',hair:'styled',retouch:'natural',background:'bluegray'},images:[{base64:image.base64,mime:'image/png'},{base64:image.base64,mime:'image/png'}]};
 const posted=await app.inject({method:'POST',url:'/api/ai/portrait/tasks',headers,payload:input});assert.equal(posted.statusCode,202,posted.body);await ready;
 const query={connectionId,requestId:input.requestId};const poll=()=>app.inject({method:'POST',url:'/api/ai/portrait/tasks/status',headers,payload:query});
 assert.equal((await poll()).json().task.phase,'waiting');assert.equal((await poll()).json().result,undefined);assert.equal(count,1);
 assert.equal((await app.inject({method:'PATCH',url:'/api/connections/image/model',headers,payload:{connectionId,model:seedreamFlashModel}})).statusCode,409);assert.equal((await poll()).json().task.phase,'waiting');
 assert.equal((await app.inject({method:'POST',url:'/api/ai/portrait/tasks',headers,payload:input})).statusCode,409);release();
 let result;for(let i=0;i<200;i++){result=(await poll()).json();if(result.task.phase==='succeeded')break;await new Promise(resolve=>setTimeout(resolve,10));}
 assert.equal(result.task.phase,'succeeded');assert.equal(result.result.requestId,input.requestId);assert.equal(result.template.width,512);assert.equal(count,1);
 const state=(await app.inject({url:'/api/session',headers})).json();assert.deepEqual(state.imageConnection.capabilities,{single:false,multiple:true});assert.equal(state.imageConnection.portraitTask.id,input.requestId);assert.ok(!JSON.stringify(state).includes(image.base64));
 const next={...input,requestId:crypto.randomUUID()};assert.equal((await app.inject({method:'POST',url:'/api/ai/portrait/tasks',headers,payload:next})).statusCode,202);
 for(let i=0;i<200&&count<2;i++)await new Promise(resolve=>setTimeout(resolve,10));assert.equal(count,2);
 await app.inject({method:'POST',url:'/api/ai/portrait/cancel',headers,payload:{requestId:next.requestId}});release();
 let stopped;for(let i=0;i<200;i++){stopped=(await app.inject({method:'POST',url:'/api/ai/portrait/tasks/status',headers,payload:{connectionId,requestId:next.requestId}})).json();if(stopped.task.phase==='cancelled')break;await new Promise(resolve=>setTimeout(resolve,10));}assert.equal(stopped.task.phase,'cancelled');assert.equal(stopped.result,undefined);assert.equal(count,2);
 await app.inject({method:'POST',url:'/api/ai/portrait/tasks/dismiss',headers,payload:{connectionId,requestId:next.requestId}});assert.equal((await poll()).statusCode,409);
 await app.inject({method:'DELETE',url:'/api/connections/image',headers});assert.equal((await poll()).statusCode,409);
});

test('Seedream model-only switch keeps the server key and VPN, resets model capabilities and never generates automatically',async t=>{
 const n=network(t);n.body={data:[{id:seedreamDefaultModel},{id:seedreamFlashModel}]};
 const app=await buildApp();t.after(()=>app.close());
 const first=await app.inject({url:'/api/session',headers:{host:'127.0.0.1:4173'}}),headers={host:'127.0.0.1:4173',origin:'http://127.0.0.1:4173',cookie:String(first.headers['set-cookie']).split(';')[0],'x-csrf-token':first.json().csrfToken};
 const summary=async()=>(await app.inject({url:'/api/session',headers})).json();
 await app.inject({method:'PUT',url:'/api/connections/image',headers,payload:config});const old=(await summary()).imageConnection.id;
 await app.inject({method:'POST',url:'/api/connections/image/auth',headers,payload:{connectionId:old,requestId:crypto.randomUUID()}});
 n.body={data:[{b64_json:image.base64}]};
 await app.inject({method:'POST',url:'/api/connections/image/test',headers,payload:{connectionId:old,requestId:crypto.randomUUID(),multiple:true}});
 assert.equal((await summary()).imageConnection.capabilities.multiple,true);
 const calls=n.calls.length,switchTo=(payload:Record<string,unknown>)=>app.inject({method:'PATCH',url:'/api/connections/image/model',headers,payload});
 assert.equal((await switchTo({connectionId:old,model:'unknown'})).statusCode,400);
 assert.equal((await switchTo({connectionId:old,model:seedreamFlashModel,baseUrl:'https://elsewhere.example'})).statusCode,400);
 assert.equal((await switchTo({connectionId:crypto.randomUUID(),model:seedreamFlashModel})).statusCode,409);
 const switched=await switchTo({connectionId:old,model:seedreamFlashModel});assert.equal(switched.statusCode,200,switched.body);assert.deepEqual(switched.json(),{switched:true});assert.equal(n.calls.length,calls);
 let s=await summary();assert.equal(s.connections.image,'connected');assert.equal(s.imageConnection.model,seedreamFlashModel);assert.equal(s.imageConnection.credentialsVerified,true);assert.equal(s.imageConnection.proxyCompatibility,true);assert.equal(s.imageConnection.size,'2048x2048');assert.equal(s.imageConnection.check,undefined);assert.equal(s.imageConnection.modelListed,undefined);assert.deepEqual(s.imageConnection.capabilities,{single:false,multiple:false});assert.notEqual(s.imageConnection.id,old);assert.ok(!JSON.stringify(s).includes(config.apiKey));
 const current=s.imageConnection.id;assert.equal((await switchTo({connectionId:old,model:seedreamDefaultModel})).statusCode,409);
 const input={connectionId:current,requestId:crypto.randomUUID(),documentId:crypto.randomUUID(),baseRevision:1,sourceAssetId:crypto.randomUUID(),style:'sky',options:{presentation:'keep',outfit:'keep',hair:'keep',retouch:'natural',background:'sky'},images:[{base64:image.base64,mime:'image/png'}]};
 const portrait=await app.inject({method:'POST',url:'/api/ai/portrait',headers,payload:input});assert.equal(portrait.statusCode,200,portrait.body);assert.equal(n.calls.length,calls+1);assert.equal(n.calls.at(-1)!.options.headers.authorization,'Bearer '+config.apiKey);assert.equal(JSON.parse(n.calls.at(-1)!.body!.toString()).model,seedreamFlashModel);
 assert.equal((await switchTo({connectionId:current,model:seedreamFlashModel})).json().switched,false);s=await summary();assert.equal(s.imageConnection.id,current);assert.equal(s.imageConnection.capabilities.single,true);
 assert.equal((await switchTo({connectionId:current,model:seedreamDefaultModel})).statusCode,200);assert.equal((await summary()).imageConnection.model,seedreamDefaultModel);
 await app.inject({method:'PUT',url:'/api/connections/image',headers,payload:{baseUrl:'https://api.openai.com/v1',model:'fictional-image-model',apiKey:config.apiKey}});const other=(await summary()).imageConnection.id;
 assert.equal((await switchTo({connectionId:other,model:seedreamFlashModel})).statusCode,409);
});
