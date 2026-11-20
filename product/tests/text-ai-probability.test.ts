import test from 'node:test';
import assert from 'node:assert/strict';
import 'fake-indexeddb/auto';
import { buildApp } from '../server/app.js';
import { assertGrounded,type ModelAdvice,type TextInput } from '../shared/text-ai.js';
import { TextAssistant } from '../client/text-ai/assistant.js';
import { DraftSession } from '../client/draft-session.js';
import { DraftStore } from '../client/storage.js';
import { emptyDocument } from '../shared/schemas.js';

const before='虚构公司 \r\n节省成本10万元。\t',after='虚构公司\n节省成本10万元。';
const fields=['diagnosis','questions','reason'] as const;
function response(text:string,field:typeof fields[number]):ModelAdvice{
 const reply:ModelAdvice={diagnosis:[],questions:[],suggestions:[{sectionId:'work',before,after,reason:'仅清理行尾'}]};
 if(field==='reason')reply.suggestions[0].reason=text;else reply[field]=[text];return reply;
}
const rejected=[
 '你被录用的概率为99%。','You have a 99% chance of receiving an offer.',
 '被录用的概率为９９％。','你被录用 的 概率为百分之九十九。',
 '有99%的概率被录用。','你的录取几率为九成。','获聘的机会为０．９９。',
 '你被录用\n的概率为 ９９ ％。','录 用 的 概 率 为 99%。',
 'An offer has a 99% likelihood.','Receiving an offer has a probability of 0.99.',
 'Your chance of getting hired is 99%.','The probability that you will be hired is 99%.',
 'With 99% probability, you will receive an offer.',
 'You have a ９９％ chance of receiving an offer.',
 'You have a 99%\n chance of receiving\t an offer.',
 'YOU HAVE A 99% CHANCE OF RECEIVING AN OFFER.',
 'You have a ninety-nine percent chance of receiving an offer.',
 'A probability of an offer: 99%.','录用率百分之一。','Resume score nine out of ten.','Your chances of being hired are 99%.',
];
const allowed=[
 '节省成本10万元。','２０２４年完成９９项虚构任务。','管理九十九个虚构工单。',
 '请核对2022—2023年经历。','Revenue increased by 10% in 2024.',
 '录用的概率需要进一步核对。','是否被录用取决于岗位，请核对原文。',
 '请进一步核对这项评分依据。','评分是一个需要核实的议题。',
 'Your chance of receiving an offer needs further review.',
 'Please check the probability of receiving an offer one more time.',
 'An exact score cannot be inferred from this resume.','I received one offer in 2024.','2024年获聘虚构公司。',
];

test('C-DEF-02-R1: common probability orders rejected through protected routes and actual client receiver; ordinary figures/non-numerical review remain usable',async t=>{
 let reply=response('请核对原文。','diagnosis');
 const app=await buildApp(false,async(_config,messages)=>({choices:[{message:{content:JSON.stringify(messages[1].content.includes('"ok":true')?{ok:true}:reply)}}]}));t.after(()=>app.close());
 const first=await app.inject({url:'/api/session',headers:{host:'127.0.0.1:4173'}});
 const headers={host:'127.0.0.1:4173',origin:'http://127.0.0.1:4173',cookie:String(first.headers['set-cookie']).split(';')[0],'x-csrf-token':first.json().csrfToken};
 const saved=await app.inject({method:'PUT',url:'/api/connections/text',headers,payload:{baseUrl:'https://fictional.example.com/v1',model:'fictional-r1',apiKey:'FICTIONAL_R1_SECRET'}});assert.equal(saved.statusCode,200);
 const connectionId:string=saved.json().textConnection.id;
 assert.equal((await app.inject({method:'POST',url:'/api/connections/text/test',headers,payload:{connectionId,requestId:crypto.randomUUID()}})).statusCode,200);
 const store=await DraftStore.open('fictional-probability-r1-'+crypto.randomUUID()),draft=new DraftSession(),doc=emptyDocument();doc.sections.find(s=>s.id==='work')!.text=before;await store.commit(doc,null);draft.attach(store,doc,[],true);
 // Bypass the server only at the transport boundary to exercise the real client's independent reply validation.
 const assistant=new TextAssistant(draft,{write:async(_path,body)=>{const input=body as TextInput;return {...reply,documentId:input.documentId,baseRevision:input.baseRevision,requestId:input.requestId};}});
 t.after(()=>{assistant.dispose();draft.dispose();store.close();});
 const request=()=>app.inject({method:'POST',url:'/api/ai/text',headers,payload:{connectionId,documentId:doc.id,baseRevision:doc.revision,requestId:crypto.randomUUID(),mode:'diagnose',prompt:'',sections:[{id:'work',text:before}]}});
 for(const text of rejected){
  for(const field of fields){
   reply=response(text,field);assert.throws(()=>assertGrounded(reply,{sections:[{id:'work',text:before}]}),/精确评分或概率/,`${field}: ${text}`);
   const result=await request();assert.equal(result.statusCode,502,`${field}: ${text}`);assert.match(result.json().error,/精确评分或概率/);
   await assistant.run('diagnose','work','',connectionId);assert.equal(assistant.getSnapshot().advice,null,`${field}: ${text}`);assert.deepEqual(assistant.getSnapshot().decisions,[]);assert.match(assistant.getSnapshot().error,/精确评分或概率/);
  }
 }
 assert.equal(assistant.getSnapshot().turns.length,0);
 for(const text of allowed){
  for(const field of fields){
   reply=response(text,field);assert.doesNotThrow(()=>assertGrounded(reply,{sections:[{id:'work',text:before}]}),`${field}: ${text}`);
   const result=await request();assert.equal(result.statusCode,200,`${field}: ${text}`);
   await assistant.run('diagnose','work','',connectionId);assert.ok(assistant.getSnapshot().advice,`${field}: ${text}`);assert.equal(assistant.getSnapshot().error,'');
  }
 }
 assert.deepEqual((await store.load()).document,doc);assert.equal((await store.load()).history.length,0);assert.deepEqual(draft.getSnapshot().document,doc);
});
