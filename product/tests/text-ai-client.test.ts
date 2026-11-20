import test from 'node:test';
import assert from 'node:assert/strict';
import 'fake-indexeddb/auto';
import { TextAssistant } from '../client/text-ai/assistant.js';
import { DraftSession } from '../client/draft-session.js';
import { DraftStore } from '../client/storage.js';
import { emptyDocument,type ResumeDocument } from '../shared/schemas.js';
import { assertGrounded,type TextInput,type Advice } from '../shared/text-ai.js';
import { LocalTextApi } from '../client/text-ai/api.js';
const connectionId=crypto.randomUUID();
const payload=(input:TextInput):Advice=>({documentId:input.documentId,baseRevision:input.baseRevision,requestId:input.requestId,diagnosis:['虚构诊断，待核实。'],questions:[],suggestions:input.sections.map(s=>({sectionId:s.id,before:s.text,after:`${s.id} 虚构甲。\n${s.id} 虚构乙。`,reason:'仅清理行尾空格和统一换行。'}))});
async function fixture(t:{after:(fn:()=>void)=>unknown}){
 const store=await DraftStore.open('fictional-ai-'+crypto.randomUUID()),draft=new DraftSession(),doc=emptyDocument();doc.basic.name='FICTIONAL_NAME';for(const id of ['summary','work','project'])doc.sections.find(s=>s.id===id)!.text=`${id} 虚构甲。 \t\r\n${id} 虚构乙。 `;await store.commit(doc,null);draft.attach(store,doc,[],true);t.after(()=>{draft.dispose();store.close();});return {store,draft,doc};
}
test('C SIM-010/011/023: three independent suggestions partial accept/reject; only accepted facts enter atomic history and confirmation invalidates',async t=>{
 const {store,draft,doc}=await fixture(t);await draft.save('confirm');assert.equal(draft.getSnapshot().document!.confirmedRevision,0);
 const assistant=new TextAssistant(draft,{write:async(_path,body)=>payload(body as TextInput)});t.after(()=>assistant.dispose());await assistant.run('diagnose',['summary','work','project'],'',connectionId);assert.deepEqual(draft.getSnapshot().document!.sections,doc.sections);
 await assistant.accept(0);assistant.reject(1);await assistant.accept(2);const current=draft.getSnapshot().document!;assert.equal(current.revision,2);assert.equal(current.confirmedRevision,null);assert.equal(current.sections.find(s=>s.id==='work')!.text,doc.sections.find(s=>s.id==='work')!.text);assert.equal(current.sections.find(s=>s.id==='project')!.text,'project 虚构甲。\nproject 虚构乙。');assert.deepEqual(assistant.getSnapshot().decisions,['accepted','rejected','accepted']);
 const data=await store.load();assert.deepEqual(data.document,current);assert.equal(data.history.filter(h=>h.source==='suggestion').length,2);assert.equal(data.history.filter(h=>h.source==='before-suggestion').length,2);
});
test('C SIM-012: current reply version checked; newer edit expires advice, old A cannot overwrite B after cancel',async t=>{
 const {draft,doc}=await fixture(t);const pending:{input:TextInput;resolve:(value:unknown)=>void}[]=[];
 const assistant=new TextAssistant(draft,{write:(path,body)=>path.endsWith('cancel')?Promise.resolve({cancelled:true}):new Promise(resolve=>pending.push({input:body as TextInput,resolve}))});t.after(()=>assistant.dispose());
 const a=assistant.run('chat','work','虚构要求A',connectionId);assert.equal(pending.length,1);assistant.cancel();const b=assistant.run('chat','work','虚构要求B',connectionId);assert.equal(pending.length,2);pending[1].resolve(payload(pending[1].input));await b;const latest=assistant.getSnapshot().advice;pending[0].resolve(payload(pending[0].input));await a;assert.equal(assistant.getSnapshot().advice,latest);
 draft.edit(d=>{d.sections.find(s=>s.id==='work')!.text='虚构新的手工编辑。';});assert.equal(assistant.getSnapshot().decisions[0],'expired');await assistant.accept(0);assert.equal(draft.getSnapshot().document!.sections.find(s=>s.id==='work')!.text,'虚构新的手工编辑。');assert.equal(doc.sections.find(s=>s.id==='work')!.text,'work 虚构甲。 \t\r\nwork 虚构乙。 ');
});
test('C SIM-012/029: response mismatch and ungrounded content rejected; document edits cancel in-flight reply',async t=>{
 const {draft}=await fixture(t);let kind='mismatch';const assistant=new TextAssistant(draft,{write:async(_path,body)=>{const result=payload(body as TextInput);if(kind==='mismatch')result.requestId=crypto.randomUUID();else result.suggestions[0].after='新增虚构数字999。';return result;}});t.after(()=>assistant.dispose());
 await assistant.run('diagnose','work','',connectionId);assert.equal(assistant.getSnapshot().advice,null);assert.match(assistant.getSnapshot().error,/版本/);kind='facts';await assistant.run('diagnose','work','',connectionId);assert.equal(assistant.getSnapshot().advice,null);assert.match(assistant.getSnapshot().error,/不得新增、删减或重组/);
 let resolve!:(value:unknown)=>void;let input!:TextInput,cancel=0;const pending=new TextAssistant(draft,{write:(path,body)=>{if(path.endsWith('cancel')){cancel++;return Promise.resolve({});}input=body as TextInput;return new Promise(done=>{resolve=done;});}});t.after(()=>pending.dispose());const request=pending.run('diagnose','work','',connectionId);draft.edit(d=>{d.basic.role='虚构更新';});assert.equal(cancel,1);resolve(payload(input));await request;assert.equal(pending.getSnapshot().advice,null);assert.equal(pending.getSnapshot().running,false);
 const oldDocument=pending.run('diagnose','work','',connectionId),switched=emptyDocument();switched.sections.find(s=>s.id==='work')!.text='FICTIONAL_OTHER_DOCUMENT';draft.attach(null,switched,[],false);resolve(payload(input));await oldDocument;assert.equal(draft.getSnapshot().document!.id,switched.id);assert.equal(draft.getSnapshot().document!.sections.find(s=>s.id==='work')!.text,'FICTIONAL_OTHER_DOCUMENT');assert.equal(pending.getSnapshot().advice,null);
});
test('C SIM-021: failed adoption leaves current facts and pending suggestion; correct retry succeeds',async t=>{
 const {draft,store,doc}=await fixture(t);let fail=true;draft.attach({async commit(...args){if(fail)throw new Error('FICTIONAL_QUOTA');return store.commit(...args);}},doc,[],true);
 const assistant=new TextAssistant(draft,{write:async(_path,body)=>payload(body as TextInput)});t.after(()=>assistant.dispose());await assistant.run('diagnose','work','',connectionId);await assistant.accept(0);assert.match(assistant.getSnapshot().error,/QUOTA/);assert.equal(assistant.getSnapshot().decisions[0],'pending');assert.deepEqual((await store.load()).document,doc);fail=false;await assistant.accept(0);assert.equal(assistant.getSnapshot().decisions[0],'accepted');assert.equal(draft.getSnapshot().document!.revision,1);
});
test('C SIM-020: API uses same-origin/CSRF and omits raw error bodies; strict grounded edits cannot introduce digits or duplicate facts',async()=>{
 const calls:{path:string;options?:RequestInit}[]=[];const api=new LocalTextApi((async(path,options)=>{calls.push({path:String(path),options});return new Response(JSON.stringify(String(path)==='/api/session'?{csrfToken:'a'.repeat(64),connections:{text:'unavailable',image:'unavailable',mcp:'disabled'}}:{error:'FICTIONAL_SAFE_FAILURE'}),{status:String(path)==='/api/session'?200:502});}) as typeof fetch);
 await assert.rejects(api.write('/api/ai/text',{}),/SAFE_FAILURE/);assert.equal(calls[1].options?.credentials,'same-origin');assert.equal((calls[1].options?.headers as Record<string,string>)['x-csrf-token'],'a'.repeat(64));
 for(const after of ['新增事实100','甲\n甲'])assert.throws(()=>assertGrounded({diagnosis:[],questions:[],suggestions:[{sectionId:'work',before:'甲\n乙',after,reason:'虚构'}]},{sections:[{id:'work',text:'甲\n乙'}]}));
});

test('C S02 L1: actual client API -> protected routes -> model JSON -> review -> IDB adoption without sending basic fields',async t=>{
 const {buildApp}=await import('../server/app.js');let sent='';const secret='FICTIONAL_INTEGRATION_SECRET';
 const app=await buildApp(false,async(_config,messages)=>{if(messages[1].content.includes('"ok":true'))return {choices:[{message:{content:'{"ok":true}'}}]};sent=messages[1].content;const input=JSON.parse(sent) as TextInput;return {choices:[{message:{content:JSON.stringify({diagnosis:['虚构诊断'],questions:[],suggestions:payload(input).suggestions})}}]};});t.after(()=>app.close());
 let cookie='';const api=new LocalTextApi((async(path,init)=>{const headers:Record<string,string>=Object.fromEntries(new Headers(init?.headers).entries());headers.host='127.0.0.1:4173';headers.origin='http://127.0.0.1:4173';if(cookie)headers.cookie=cookie;
 const response=await app.inject({url:String(path),method:(init?.method??'GET') as 'GET'|'POST'|'PUT'|'DELETE',headers,...(typeof init?.body==='string'?{payload:init.body}:{})});if(response.headers['set-cookie'])cookie=String(response.headers['set-cookie']).split(';')[0];assert.ok(!response.body.includes(secret));return new Response(response.body,{status:response.statusCode});}) as typeof fetch);
 await api.session();await api.write('/api/connections/text',{baseUrl:'https://example.com/v1',model:'fictional',apiKey:secret},'PUT');const configured=await api.session();await api.write('/api/connections/text/test',{requestId:crypto.randomUUID(),connectionId:configured.textConnection!.id});const connected=await api.session();assert.equal(connected.connections.text,'connected');
 const {draft,store,doc}=await fixture(t);const assistant=new TextAssistant(draft,api);t.after(()=>assistant.dispose());await assistant.run('chat',['summary','project'],'仅清理行尾空格',connected.textConnection!.id);assert.ok(assistant.getSnapshot().advice);assert.deepEqual(draft.getSnapshot().document!.sections,doc.sections);assert.ok(!sent.includes(doc.basic.name));assert.ok(!sent.includes(secret));assert.deepEqual((JSON.parse(sent) as TextInput).sections.map(s=>s.id),['summary','project']);
 await assistant.accept(0);assistant.reject(1);assert.equal((await store.load()).document!.revision,1);assert.deepEqual(assistant.getSnapshot().decisions,['accepted','rejected']);
});

test('C SIM-020/022: clear local workspace first disconnects credentials/tasks; offline service reports unconfirmed cleanup without blocking local deletion',async t=>{
 const {clearWorkspace}=await import('../client/clear-workspace.js');const {draft,store}=await fixture(t);await draft.save('snapshot');let called=false;
 const result=await clearWorkspace(draft,{write:async(path,_body,method)=>{assert.equal(path,'/api/connections');assert.equal(method,'DELETE');assert.ok((await store.load()).history.length>0);called=true;return {};}});assert.equal(called,true);assert.equal(result.credentialsCleared,true);assert.equal((await store.load()).history.length,0);assert.equal(draft.getSnapshot().document!.basic.name,'');
 draft.edit(d=>{d.basic.name='FICTIONAL_OFFLINE';});await draft.save('snapshot');const offline=await clearWorkspace(draft,{write:async()=>{throw new Error('FICTIONAL_OFFLINE');}});assert.equal(offline.credentialsCleared,false);assert.equal((await store.load()).document!.basic.name,'');assert.equal((await store.load()).history.length,0);
});

test('C-DEF-01 browser trust boundary: reattributed source lines cannot be offered or persisted even if server returns them',async t=>{
 const {draft,store}=await fixture(t);
 draft.edit(d=>{d.sections.find(s=>s.id==='work')!.text='甲公司（2022—2023）\n负责甲系统，节省成本10万元。\n乙公司（2024—2025）\n负责乙系统。';});await draft.save();const prior=await store.load();
 const assistant=new TextAssistant(draft,{write:async(_path,body)=>{const input=body as TextInput;return {documentId:input.documentId,baseRevision:input.baseRevision,requestId:input.requestId,diagnosis:[],questions:[],suggestions:[{sectionId:'work',before:input.sections[0].text,after:'乙公司（2024—2025）\n负责甲系统，节省成本10万元。',reason:'虚构重组'}]};}});t.after(()=>assistant.dispose());
 await assistant.run('diagnose','work','',connectionId);assert.equal(assistant.getSnapshot().advice,null);assert.match(assistant.getSnapshot().error,/不得新增、删减或重组/);await assistant.accept(0);assert.deepEqual(await store.load(),prior);
});

test('C-DEF-01 current contract: queued autosave/snapshot, safe adoption and restore keep full facts and revision consistent',async t=>{
 const {draft,store,doc}=await fixture(t);await draft.save('confirm');const assistant=new TextAssistant(draft,{write:async(_path,body)=>payload(body as TextInput)});t.after(()=>assistant.dispose());
 await assistant.run('chat','work','清理行尾空格',connectionId);const saving=draft.save(),snapshot=draft.save('snapshot');await Promise.all([saving,snapshot]);await assistant.accept(0);
 const saved=await store.load(),backup=saved.history.find(h=>h.source==='before-suggestion')!;assert.ok(backup);assert.equal(assistant.getSnapshot().decisions[0],'accepted');assert.deepEqual(backup.document.sections,doc.sections);assert.equal(saved.document!.confirmedRevision,null);
 await draft.save('restore',backup);assert.deepEqual(draft.getSnapshot().document!.sections,doc.sections);assert.deepEqual((await store.load()).document,draft.getSnapshot().document);assert.equal(draft.unsaved,false);
});


test('local session diagnostics separate network, HTTP, JSON and schema failures without exposing response data',async()=>{
 for(const [fetcher,expected] of [
  [async()=>{throw new Error('PRIVATE_NETWORK_DETAIL');},/无法连接本机状态接口/],
  [async()=>new Response('PRIVATE_HTTP_DETAIL',{status:503}),/HTTP 503/],
  [async()=>new Response('<html>PRIVATE_HTML_DETAIL</html>'),/有效JSON/],
  [async()=>Response.json({private:'PRIVATE_SCHEMA_DETAIL'}),/状态格式不匹配/],
 ] as const){
  const api=new LocalTextApi(fetcher as typeof fetch);
  await assert.rejects(api.session(),error=>{assert.ok(error instanceof Error);assert.match(error.message,expected);assert.ok(!error.message.includes('PRIVATE_'));return true;});
 }
});

test('default browser fetch keeps the global receiver rather than the LocalTextApi instance',async t=>{
 let calls=0;
 t.mock.method(globalThis,'fetch',async function(this:unknown){
  assert.equal(this,globalThis,'browser native fetch requires its global receiver');calls++;
  return Response.json({csrfToken:'b'.repeat(64),connections:{text:'unavailable',image:'unavailable',mcp:'disabled'}});
 });
 const api=new LocalTextApi();
 assert.equal((await api.session()).connections.image,'unavailable');assert.equal(calls,1);
});
