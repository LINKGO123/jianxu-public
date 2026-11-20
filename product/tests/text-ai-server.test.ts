import test from 'node:test';
import assert from 'node:assert/strict';
import { buildApp } from '../server/app.js';
import type { Completion } from '../server/text-network.js';
let connectionId=crypto.randomUUID();
const secret='FICTIONAL_SECRET_SENTINEL_2026',config={baseUrl:'https://example.com/v1',model:'fictional-model',apiKey:secret};
const output=(value:unknown)=>({choices:[{message:{content:JSON.stringify(value)}}]});
const body=()=>({connectionId,documentId:crypto.randomUUID(),baseRevision:3,requestId:crypto.randomUUID(),mode:'diagnose',prompt:'',sections:[{id:'work',text:'虚构事实甲。 \r\n虚构事实乙。 '}]});
async function start(t:{after:(fn:()=>Promise<void>)=>unknown},completion:Completion){const app=await buildApp(false,completion);t.after(()=>app.close());const response=await app.inject({url:'/api/session',headers:{host:'127.0.0.1:4173'}});const headers={host:'127.0.0.1:4173',origin:'http://127.0.0.1:4173',cookie:String(response.headers['set-cookie']).split(';')[0],'x-csrf-token':response.json().csrfToken};return {app,headers};}
async function testTarget(app:Awaited<ReturnType<typeof buildApp>>,headers:Record<string,string>){const info=await app.inject({url:'/api/session',headers});connectionId=info.json().textConnection?.id??crypto.randomUUID();return {requestId:crypto.randomUUID(),connectionId};}
const good={diagnosis:['请核对原文阅读顺序。'],questions:['是否需要保留两条事实？'],suggestions:[{sectionId:'work',before:'虚构事实甲。 \r\n虚构事实乙。 ',after:'虚构事实甲。\n虚构事实乙。',reason:'统一换行并清理行尾空格。'}]};
test('C SIM-019/020: format save is not success; real completion invocation tests ability; credentials/session isolation',async t=>{
 let calls=0;const {app,headers}=await start(t,async(connection,messages)=>{calls++;assert.equal(connection.apiKey,secret);assert.ok(!JSON.stringify(messages).includes(secret));return output({ok:true});});
 const saved=await app.inject({method:'PUT',url:'/api/connections/text',headers,payload:config});assert.equal(saved.statusCode,200);assert.equal(saved.json().connections.text,'configured');assert.equal(calls,0);assert.ok(!saved.body.includes(secret));
 const invalid=await app.inject({method:'PUT',url:'/api/connections/text',headers,payload:{...config,baseUrl:'https://example.com/?key='+secret}});assert.equal(invalid.statusCode,400);assert.ok(!invalid.body.includes(secret));
 for(const bad of [{...config,apiKey:secret+'\n'},{...config,model:config.model+'\nX'}]){const refused=await app.inject({method:'PUT',url:'/api/connections/text',headers,payload:bad});assert.equal(refused.statusCode,400);assert.ok(!refused.body.includes(secret));}
 const tested=await app.inject({method:'POST',url:'/api/connections/text/test',headers,payload:await testTarget(app,headers)});assert.equal(tested.statusCode,200);assert.equal(tested.json().connections.text,'connected');assert.equal(calls,1);assert.ok(!tested.body.includes(secret));
 const session=await app.inject({url:'/api/session',headers});assert.equal(session.json().textConnection.model,config.model);assert.ok(!session.body.includes(secret));const other=await app.inject({url:'/api/session',headers:{host:'127.0.0.1:4173'}});assert.equal(other.json().connections.text,'unavailable');
 const cleared=await app.inject({method:'DELETE',url:'/api/connections/text',headers,payload:{}});assert.equal(cleared.json().connections.text,'unavailable');assert.equal(cleared.json().connections.image,'unavailable');assert.equal(cleared.json().connections.mcp,'disabled');assert.ok(!cleared.body.includes(secret));
});
test('C SIM-010/011/029: grounded response and strict target boundary; hallucinated facts/numbers/paths/ratings refused',async t=>{
 let reply:unknown=good;let escaped=false;let requestCount=0;const {app,headers}=await start(t,async(_connection,messages)=>{requestCount++;return messages[1].content.includes('"ok":true')?output({ok:true}):escaped?{choices:[{message:{content:JSON.stringify(reply).replace('FICTIONAL','\\u0046ICTIONAL')}}]}:output(reply);});
 await app.inject({method:'PUT',url:'/api/connections/text',headers,payload:config});await app.inject({method:'POST',url:'/api/connections/text/test',headers,payload:await testTarget(app,headers)});
 await testTarget(app,headers);const request=body(),success=await app.inject({method:'POST',url:'/api/ai/text',headers,payload:request});assert.equal(success.statusCode,200);assert.equal(success.json().baseRevision,3);assert.equal(success.json().requestId,request.requestId);assert.equal(success.json().suggestions[0].after,good.suggestions[0].after);
 for(const after of ['虚构新增成果100万元。','<script>NEW_FACT</script>','虚构事实甲。\n虚构事实甲。']){reply={...good,suggestions:[{...good.suggestions[0],after}]};const response=await app.inject({method:'POST',url:'/api/ai/text',headers,payload:body()});assert.equal(response.statusCode,502);assert.match(response.json().error,/不得新增、删减或重组/);}
 reply={...good,suggestions:[{...good.suggestions[0],sectionId:'__proto__'}]};assert.equal((await app.inject({method:'POST',url:'/api/ai/text',headers,payload:body()})).statusCode,502);
 reply={...good,suggestions:[{...good.suggestions[0],reason:'录用率99%'}]};assert.equal((await app.inject({method:'POST',url:'/api/ai/text',headers,payload:body()})).statusCode,502);
 reply={...good,diagnosis:['录用率98%']};assert.equal((await app.inject({method:'POST',url:'/api/ai/text',headers,payload:body()})).statusCode,502);
 escaped=true;reply={...good,diagnosis:[secret]};const leaked=await app.inject({method:'POST',url:'/api/ai/text',headers,payload:body()});assert.equal(leaked.statusCode,502);assert.ok(!leaked.body.includes(secret));
 const previous=requestCount;const extra=await app.inject({method:'POST',url:'/api/ai/text',headers,payload:{...body(),apiKey:secret}});assert.equal(extra.statusCode,400);assert.equal(requestCount,previous);assert.ok(!extra.body.includes(secret));
});
test('C SIM-013: missing connection/auth/limit/bad JSON fail honestly; no automatic retry or credential echo',async t=>{
 let mode='auth',calls=0;const {app,headers}=await start(t,async()=>{calls++;if(mode==='json')return {choices:[{message:{content:'not JSON'}}]};if(mode==='secret')throw new Error(secret);throw new Error(mode==='auth'?'认证失败，请检查Key和模型权限。':'服务限流，请稍后手动重试。');});
 assert.equal((await app.inject({method:'POST',url:'/api/ai/text',headers,payload:body()})).statusCode,409);assert.equal(calls,0);
 await app.inject({method:'PUT',url:'/api/connections/text',headers,payload:config});for(mode of ['auth','limit','json','secret']){const before:number=calls,response=await app.inject({method:'POST',url:'/api/connections/text/test',headers,payload:await testTarget(app,headers)});assert.equal(response.statusCode,502);assert.equal(calls,before+1);assert.ok(!response.body.includes(secret));assert.notEqual(response.json().connections?.text,'connected');}
 assert.equal((await app.inject({url:'/api/session',headers})).json().connections.text,'failed');
});
test('C SIM-012/013: one in-flight task, explicit cancel, replacement/disconnect cancel old config and suppress late success',async t=>{
 let signal:AbortSignal|undefined,release!:(value:unknown)=>void;const {app,headers}=await start(t,async(_c,_m,s)=>{signal=s;return new Promise(resolve=>{release=resolve;});});
 try{
 await app.inject({method:'PUT',url:'/api/connections/text',headers,payload:config});const target=await testTarget(app,headers),id=target.requestId,pending=app.inject({method:'POST',url:'/api/connections/text/test',headers,payload:target});
 for(let i=0;i<20&&!signal;i++)await new Promise(resolve=>setImmediate(resolve));assert.ok(signal);assert.equal((await app.inject({method:'POST',url:'/api/connections/text/test',headers,payload:await testTarget(app,headers)})).statusCode,409);
 assert.equal((await app.inject({method:'POST',url:'/api/ai/text/cancel',headers,payload:{requestId:id}})).json().cancelled,true);assert.equal(signal.aborted,true);
 await app.inject({method:'PUT',url:'/api/connections/text',headers,payload:{...config,model:'fictional-other'}});release(output({ok:true}));assert.equal((await pending).statusCode,499);assert.equal((await app.inject({url:'/api/session',headers})).json().connections.text,'configured');
 signal=undefined;const second=app.inject({method:'POST',url:'/api/connections/text/test',headers,payload:await testTarget(app,headers)});for(let i=0;i<20&&!signal;i++)await new Promise(resolve=>setImmediate(resolve));await app.inject({method:'DELETE',url:'/api/connections/text',headers,payload:{}});assert.equal((signal as AbortSignal|undefined)?.aborted,true);release(output({ok:true}));assert.equal((await second).statusCode,499);assert.equal((await app.inject({url:'/api/session',headers})).json().connections.text,'unavailable');
 }finally{release?.(output({ok:true}));}

});

test('C SIM-013: production 60-second deadline aborts transport and never claims connection success',async t=>{
 let signal:AbortSignal|undefined;const {app,headers}=await start(t,async(_c,_m,s)=>{signal=s;return new Promise((_resolve,reject)=>s.addEventListener('abort',()=>reject(new Error('FICTIONAL_TIMEOUT')),{once:true}));});
 await app.inject({method:'PUT',url:'/api/connections/text',headers,payload:config});t.mock.timers.enable({apis:['setTimeout']});
 const pending=app.inject({method:'POST',url:'/api/connections/text/test',headers,payload:await testTarget(app,headers)});for(let i=0;i<20&&!signal;i++)await new Promise(resolve=>setImmediate(resolve));assert.ok(signal);t.mock.timers.tick(59999);assert.equal(signal.aborted,false);t.mock.timers.tick(1);assert.equal(signal.aborted,true);assert.equal((await pending).statusCode,499);assert.notEqual((await app.inject({url:'/api/session',headers})).json().connections.text,'connected');t.mock.timers.reset();
});

test('C SIM-019/030: stale client consent cannot send selected resume to a newly configured receiver',async t=>{
 let calls=0;const {app,headers}=await start(t,async(_c,m)=>{calls++;return m[1].content.includes('"ok":true')?output({ok:true}):output(good);});
 await app.inject({method:'PUT',url:'/api/connections/text',headers,payload:config});const old=await testTarget(app,headers);await app.inject({method:'POST',url:'/api/connections/text/test',headers,payload:old});
 await app.inject({method:'PUT',url:'/api/connections/text',headers,payload:{...config,baseUrl:'https://other.example.com/v1'}});await app.inject({method:'POST',url:'/api/connections/text/test',headers,payload:await testTarget(app,headers)});const before:number=calls;
 const response=await app.inject({method:'POST',url:'/api/ai/text',headers,payload:{...body(),connectionId:old.connectionId}});assert.equal(response.statusCode,409);assert.match(response.json().error,/连接目标已更改/);assert.equal(calls,before);
 const staleTest=await app.inject({method:'POST',url:'/api/connections/text/test',headers,payload:old});assert.equal(staleTest.statusCode,409);assert.equal(calls,before);
});
