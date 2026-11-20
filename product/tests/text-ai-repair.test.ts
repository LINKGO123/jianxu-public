import test from 'node:test';
import assert from 'node:assert/strict';
import { assertGrounded,type ModelAdvice } from '../shared/text-ai.js';
import { buildApp } from '../server/app.js';

const before='甲公司（2022—2023） \r\n  负责甲系统，节省成本10万元。\t\r\n\r\n乙公司（2024—2025）\r\n  负责乙系统。 ';
const formatted='甲公司（2022—2023）\n  负责甲系统，节省成本10万元。\n\n乙公司（2024—2025）\n  负责乙系统。';
const advice=(after=formatted):ModelAdvice=>({diagnosis:[],questions:[],suggestions:[{sectionId:'work',before,after,reason:'保留完整经历，仅清理行尾和换行。'}]});
const config={baseUrl:'https://fictional.example.com/v1',model:'fictional-repair',apiKey:'FICTIONAL_REPAIR_SECRET'};
const output=(value:unknown)=>({choices:[{message:{content:JSON.stringify(value)}}]});

test('C-DEF-01 current contract: preserve complete entries, ownership, blanks and indentation; no extraction/reordering even without boundaries',()=>{
 assert.doesNotThrow(()=>assertGrounded(advice(),{sections:[{id:'work',text:before}]}));
 for(const after of [
  '乙公司（2024—2025）\n负责甲系统，节省成本10万元。',
  '  负责甲系统，节省成本10万元。\n\n乙公司（2024—2025）\n  负责乙系统。',
  '乙公司（2024—2025）\n  负责乙系统。\n\n甲公司（2022—2023）\n  负责甲系统，节省成本10万元。',
  formatted+'\n  负责甲系统，节省成本10万元。',
  formatted.replace('  负责甲','负责甲'),formatted.replace('\n\n','\n'),
  formatted.replace('节省成本10万元','节省成本100万元'),
 ])assert.throws(()=>assertGrounded(advice(after),{sections:[{id:'work',text:before}]}),/不得新增、删减或重组/);
 const unstructured='甲公司\n成果甲\n乙公司\n成果乙';
 assert.throws(()=>assertGrounded({...advice(),suggestions:[{...advice().suggestions[0],before:unstructured,after:'乙公司\n成果甲'}]},{sections:[{id:'work',text:unstructured}]}));
});

test('C-DEF-02: normalized bilingual numerical assessments rejected in every advice field; ordinary experience figures retained',async t=>{
 let reply:ModelAdvice=advice();
 const app=await buildApp(false,async(_c,m)=>m[1].content.includes('"ok":true')?output({ok:true}):output(reply));t.after(()=>app.close());
 const session=await app.inject({url:'/api/session',headers:{host:'127.0.0.1:4173'}});
 const headers={host:'127.0.0.1:4173',origin:'http://127.0.0.1:4173',cookie:String(session.headers['set-cookie']).split(';')[0],'x-csrf-token':session.json().csrfToken};
 const saved=await app.inject({method:'PUT',url:'/api/connections/text',headers,payload:config}),connectionId=saved.json().textConnection.id;
 await app.inject({method:'POST',url:'/api/connections/text/test',headers,payload:{connectionId,requestId:crypto.randomUUID()}});
 const input={connectionId,documentId:crypto.randomUUID(),baseRevision:0,mode:'diagnose',prompt:'',sections:[{id:'work',text:before}]};
 for(const text of ['Offer probability: 99%','录用率９９％','录用率百分之九十九','预计录取概率为九成','评分：９９／１００','Resume score: 9.5/10','Hiring chance: 80%','99% offer probability','Probability of an offer: 99%','Offer probability: ninety-nine percent','录用率\n９９％']){
  for(const field of ['diagnosis','questions','reason']){
   reply=advice();if(field==='reason')reply.suggestions[0].reason=text;else if(field==='diagnosis')reply.diagnosis=[text];else reply.questions=[text];
   assert.throws(()=>assertGrounded(reply,{sections:input.sections as {id:'work';text:string}[]}),/精确评分或概率/);
   const response=await app.inject({method:'POST',url:'/api/ai/text',headers,payload:{...input,requestId:crypto.randomUUID()}});assert.equal(response.statusCode,502,field+': '+text);assert.match(response.json().error,/精确评分或概率/);
  }
 }
 for(const text of ['节省成本10万元。','负责２０２４年项目，完成９９项任务。','管理九十九个虚构工单。','录用率无法推断；请核对节省成本10万元的依据。']){
  reply={diagnosis:[text],questions:[text],suggestions:[{...advice().suggestions[0],reason:text}]};
  assert.doesNotThrow(()=>assertGrounded(reply,{sections:[{id:'work',text:before}]}));
  assert.equal((await app.inject({method:'POST',url:'/api/ai/text',headers,payload:{...input,requestId:crypto.randomUUID()}})).statusCode,200,text);
 }
});

for(const mode of ['test','diagnose','chat'] as const){
 for(const boundary of ['before','exact','after','get-cleanup','timer-cleanup'] as const){
  test(`C-DEF-03: ${mode} completion at ${boundary}; expired result never succeeds and another session remains valid`,async t=>{
   let now=Date.now();t.mock.method(Date,'now',()=>now);t.mock.timers.enable({apis:['setInterval']});
   let pending=false,entered=false,signal:AbortSignal|undefined,release!:(value:unknown)=>void;
   const app=await buildApp(false,async(_c,m,s)=>{
    if(pending){entered=true;signal=s;return new Promise(resolve=>{release=resolve;});}
    return m[1].content.includes('"ok":true')?output({ok:true}):output(advice());
   });t.after(()=>app.close());
   const first=await app.inject({url:'/api/session',headers:{host:'127.0.0.1:4173'}});
   const headers={host:'127.0.0.1:4173',origin:'http://127.0.0.1:4173',cookie:String(first.headers['set-cookie']).split(';')[0],'x-csrf-token':first.json().csrfToken};
   const saved=await app.inject({method:'PUT',url:'/api/connections/text',headers,payload:config}),connectionId=saved.json().textConnection.id;
   const expiry=now+8*60*60*1000;
   if(mode!=='test')assert.equal((await app.inject({method:'POST',url:'/api/connections/text/test',headers,payload:{connectionId,requestId:crypto.randomUUID()}})).statusCode,200);
   now=expiry-500;
   const other=await app.inject({url:'/api/session',headers:{host:'127.0.0.1:4173'}});
   const otherHeaders={...headers,cookie:String(other.headers['set-cookie']).split(';')[0],'x-csrf-token':other.json().csrfToken};
   assert.equal((await app.inject({method:'PUT',url:'/api/connections/text',headers:otherHeaders,payload:config})).statusCode,200);
   pending=true;
   const payload={connectionId,requestId:crypto.randomUUID(),...(mode==='test'?{}:{documentId:crypto.randomUUID(),baseRevision:0,mode,prompt:mode==='chat'?'仅清理行尾':'',sections:[{id:'work',text:before}]})};
   const request=app.inject({method:'POST',url:mode==='test'?'/api/connections/text/test':'/api/ai/text',headers,payload});
   try{
    for(let i=0;i<50&&!entered;i++)await new Promise(resolve=>setImmediate(resolve));assert.ok(entered);
    now=boundary==='before'?expiry-1:boundary==='exact'?expiry:expiry+1;
    if(boundary==='get-cleanup')await app.inject({url:'/api/session',headers});
    if(boundary==='timer-cleanup')t.mock.timers.tick(60000);
    release(mode==='test'?output({ok:true}):output(advice()));const response=await request;
    assert.equal(response.statusCode,boundary==='before'?200:401);
    if(boundary==='before'){if(mode==='test')assert.equal(response.json().connections.text,'connected');else assert.equal(response.json().suggestions.length,1);}
    else {assert.match(response.json().error,/会话已到期/);assert.equal(response.json().connections,undefined);assert.equal(response.json().suggestions,undefined);assert.equal(signal?.aborted,true);}
    pending=false;
    const otherInfo=await app.inject({url:'/api/session',headers:otherHeaders});assert.equal(otherInfo.json().connections.text,'configured');
    const otherResult=await app.inject({method:'POST',url:'/api/connections/text/test',headers:otherHeaders,payload:{connectionId:otherInfo.json().textConnection.id,requestId:crypto.randomUUID()}});assert.equal(otherResult.statusCode,200);assert.equal(otherResult.json().connections.text,'connected');
   }finally{release?.(output({ok:true}));}
  });
 }
}
