import test from 'node:test';
import assert from 'node:assert/strict';
import 'fake-indexeddb/auto';
import {createCanvas} from '@napi-rs/canvas';
import {buildApp} from '../server/app.js';
import {normalizeImage} from '../server/image-codec.js';
import {portraitPrompt} from '../server/image-routes.js';
import {PortraitAssistant,templateDigest} from '../client/portrait-ai/assistant.js';
import {DraftSession} from '../client/draft-session.js';
import {DraftStore} from '../client/storage.js';
import {emptyDocument,editDocument,type ResumeDocument} from '../shared/schemas.js';
import Yearbook from '../shared/yearbook-model.js';
import {namePinyin,cardName} from '../client/portrait-ai/card.js';
import type {PortraitInput} from '../shared/portrait-ai.js';
import type {PortraitAsset} from '../client/portrait/assets.js';
function png(color='#4897d0'){const canvas=createCanvas(32,40),ctx=canvas.getContext('2d');ctx.fillStyle=color;ctx.fillRect(0,0,32,40);return canvas.toBuffer('image/png');}
const bytes=png(),image={base64:bytes.toString('base64'),mime:'image/png' as const};
const config={baseUrl:'https://fictional.example.com/v1',model:'fictional-edit',apiKey:'FICTIONAL_IMAGE_SECRET'};
const options=Yearbook.normalize();
async function local(t:{after:(fn:()=>void)=>unknown}){
 const store=await DraftStore.open('fictional-image-'+crypto.randomUUID()),draft=new DraftSession(),doc=emptyDocument();doc.basic.name='虚构姓名';doc.sections[0].text='虚构经历。';await store.commit(doc,null);
 const original:PortraitAsset={id:crypto.randomUUID(),parentId:null,kind:'original',blob:new Blob([new Uint8Array(png('#fff'))],{type:'image/png'}),width:32,height:40};
 const crop:PortraitAsset={id:crypto.randomUUID(),parentId:original.id,kind:'crop',blob:new Blob([new Uint8Array(bytes)],{type:'image/png'}),width:32,height:40};
 const current=editDocument(doc,d=>{d.portrait.originalAssetId=original.id;d.portrait.appliedAssetId=crop.id;});const saved=await store.commit(doc,0,'portrait',undefined,{replacement:current,assets:[original,crop]});draft.attach(store,current,saved.history,true,saved.assets);
 t.after(()=>{draft.dispose();store.close();});return {store,draft,original,crop,current};
}
const decode=async()=>({width:32,height:40,close(){}} as ImageBitmap);
const result=(input:PortraitInput)=>({requestId:input.requestId,documentId:input.documentId,baseRevision:input.baseRevision,sourceAssetId:input.sourceAssetId,style:input.style,image:{base64:image.base64,width:32,height:40}});

test('D SIM-016/019/020: real image codec, independent configuration, actual single/multiple edit probes and guarded candidate routes',async t=>{
 const calls:{model:string;count:number;prompt:string}[]=[];
 const app=await buildApp(false,undefined,{image:async(config,images,prompt)=>{calls.push({model:config.model,count:images.length,prompt});return {data:[{b64_json:images[0].base64}]};}});t.after(()=>app.close());
 const first=await app.inject({url:'/api/session',headers:{host:'127.0.0.1:4173'}}),headers={host:'127.0.0.1:4173',origin:'http://127.0.0.1:4173',cookie:String(first.headers['set-cookie']).split(';')[0],'x-csrf-token':first.json().csrfToken};
 const save=await app.inject({method:'PUT',url:'/api/connections/image',headers,payload:config});assert.equal(save.statusCode,200);assert.equal(calls.length,0);
 let session=(await app.inject({url:'/api/session',headers})).json();assert.equal(session.connections.image,'configured');assert.equal(session.connections.text,'unavailable');assert.equal(session.connections.mcp,'disabled');assert.ok(!JSON.stringify(session).includes(config.apiKey));
 const id=session.imageConnection.id,testPayload={connectionId:id,requestId:crypto.randomUUID(),multiple:true};
 const tested=await app.inject({method:'POST',url:'/api/connections/image/test',headers,payload:testPayload});assert.equal(tested.statusCode,200,tested.body);assert.deepEqual(calls.map(c=>c.count),[1,2]);
 session=(await app.inject({url:'/api/session',headers})).json();assert.deepEqual(session.imageConnection.capabilities,{single:true,multiple:true});
 const input:PortraitInput={connectionId:id,requestId:crypto.randomUUID(),documentId:crypto.randomUUID(),baseRevision:4,sourceAssetId:crypto.randomUUID(),style:'white',options,images:[image]};
 const privacyInput={...input,options:{presentation:options.presentation,outfit:options.outfit,hair:options.hair,retouch:options.retouch,background:options.background}};
 const candidate=await app.inject({method:'POST',url:'/api/ai/portrait',headers,payload:privacyInput});assert.equal(candidate.statusCode,200,candidate.body);assert.equal(candidate.json().baseRevision,4);assert.equal(candidate.json().image.width,32);assert.ok(!candidate.body.includes(config.apiKey));assert.match(calls.at(-1)!.prompt,/纯白/);
 assert.equal((await app.inject({method:'POST',url:'/api/ai/portrait',headers,payload:{...privacyInput,name:'PRIVATE'}})).statusCode,400);
 await app.inject({method:'DELETE',url:'/api/connections',headers,payload:{}});session=(await app.inject({url:'/api/session',headers})).json();assert.deepEqual(session.connections,{text:'unavailable',image:'unavailable',mcp:'disabled'});
});

test('D SIM-005/018/020: decoder checks actual bytes/pixels and strips metadata; no fake URL-only image success',async()=>{
 const output=await normalizeImage({base64:Buffer.concat([bytes,Buffer.from('FICTIONAL_TRAILING_METADATA')]).toString('base64'),mime:'image/png'},new AbortController().signal);assert.equal(output.width,32);assert.ok(!Buffer.from(output.base64,'base64').includes(Buffer.from('FICTIONAL_TRAILING_METADATA')));
 await assert.rejects(normalizeImage({base64:Buffer.from('not a PNG').toString('base64'),mime:'image/png'},new AbortController().signal));
 await assert.rejects(normalizeImage({base64:image.base64,mime:'image/jpeg'},new AbortController().signal));
 const oversized=Buffer.from(bytes);oversized.writeUInt32BE(24000001,16);await assert.rejects(normalizeImage({base64:oversized.toString('base64'),mime:'image/png'},new AbortController().signal));
});

test('D SIM-018/019: unsupported generation-only response cannot pass edit detection or publish connected',async t=>{
 const app=await buildApp(false,undefined,{image:async()=>({data:[{url:'https://untrusted.example/image.png'}]})});t.after(()=>app.close());const first=await app.inject({url:'/api/session',headers:{host:'127.0.0.1:4173'}}),headers={host:'127.0.0.1:4173',origin:'http://127.0.0.1:4173',cookie:String(first.headers['set-cookie']).split(';')[0],'x-csrf-token':first.json().csrfToken};
 await app.inject({method:'PUT',url:'/api/connections/image',headers,payload:config});const session=(await app.inject({url:'/api/session',headers})).json();const response=await app.inject({method:'POST',url:'/api/connections/image/test',headers,payload:{connectionId:session.imageConnection.id,requestId:crypto.randomUUID(),multiple:false}});assert.equal(response.statusCode,502);assert.match(response.json().error,/data\[0\].b64_json/);assert.ok(!response.body.includes('untrusted.example'));assert.equal((await app.inject({url:'/api/session',headers})).json().connections.image,'failed');
});

test('D SIM-018/021/023: candidate has no effect until atomic adoption; save failure retains candidate, retry preserves original/crop and invalidates confirmation',async t=>{
 const {store,draft,crop,current}=await local(t);await draft.save('confirm');let payload:PortraitInput|undefined;const assistant=new PortraitAssistant(draft,{write:async(_path,body)=>{payload=body as PortraitInput;return result(payload);}},decode);t.after(()=>assistant.dispose());
 await assistant.generate(crop,null,'yearbook',options,crypto.randomUUID());assert.ok(assistant.getSnapshot().candidate);assert.deepEqual(draft.getSnapshot().document!.sections,current.sections);assert.equal(draft.getSnapshot().document!.portrait.appliedAssetId,crop.id);assert.deepEqual(Object.keys(payload!.options).sort(),['background','hair','outfit','presentation','retouch']);assert.ok(!JSON.stringify(payload).includes(current.basic.name));
 let fail=true;draft.attach({commit:async(...args)=>{if(fail)throw new Error('FICTIONAL_QUOTA');return store.commit(...args);}},draft.getSnapshot().document!,draft.getSnapshot().history,true,draft.getSnapshot().assets);
 await assert.rejects(assistant.apply(options),/QUOTA/);assert.equal(draft.getSnapshot().document!.portrait.appliedAssetId,crop.id);assert.ok(assistant.getSnapshot().candidate);fail=false;await assistant.apply(options);
 const data=await store.load();assert.equal(data.document!.confirmedRevision,null);assert.equal(data.history.find(h=>h.source==='before-portrait')!.document.portrait.appliedAssetId,crop.id);const applied=data.assets[data.document!.portrait.appliedAssetId!];assert.equal(applied.kind,'ai');assert.equal(applied.sourceId,crop.id);assert.ok(data.assets[crop.id]);assert.ok(data.assets[crop.parentId!]);
});

test('D SIM-018: same-revision saves do not cancel, A/B late/cancel/edit/dispose never overwrite current photo',async t=>{
 const {draft,crop}=await local(t);const pending:{input:PortraitInput;resolve:(value:unknown)=>void}[]=[];const assistant=new PortraitAssistant(draft,{write:(path,body)=>path.endsWith('cancel')?Promise.resolve({}):new Promise(resolve=>pending.push({input:body as PortraitInput,resolve}))},decode);t.after(()=>assistant.dispose());
 const a=assistant.generate(crop,null,'sky',options,crypto.randomUUID());for(let i=0;i<20&&!pending.length;i++)await new Promise(resolve=>setImmediate(resolve));await draft.save('snapshot');assert.equal(assistant.getSnapshot().running,true);assistant.cancel();const b=assistant.generate(crop,null,'gray',options,crypto.randomUUID());for(let i=0;i<20&&pending.length<2;i++)await new Promise(resolve=>setImmediate(resolve));pending[1].resolve(result(pending[1].input));await b;const candidate=assistant.getSnapshot().candidate;pending[0].resolve(result(pending[0].input));await a;assert.equal(assistant.getSnapshot().candidate,candidate);
 draft.edit(doc=>{doc.basic.role='虚构新编辑';});assert.equal(assistant.getSnapshot().candidate,null);assert.equal(draft.getSnapshot().document!.portrait.appliedAssetId,crop.id);
 const c=assistant.generate(crop,null,'white',options,crypto.randomUUID());for(let i=0;i<20&&pending.length<3;i++)await new Promise(resolve=>setImmediate(resolve));assistant.dispose();pending[2].resolve(result(pending[2].input));await c;assert.equal(draft.getSnapshot().document!.portrait.appliedAssetId,crop.id);
});

test('D SIM-017/022: real pinyin, editable names and two-line rules; card graph restores, missing asset blocks, GC keeps shared origins then clears',async t=>{
 const {store,draft,crop}=await local(t);const doc=draft.getSnapshot().document!;
 assert.equal(cardName({...options,nameMode:'given'}, {...doc.basic,name:'欧阳娜娜'}),'NANA');assert.equal(cardName({...options,nameMode:'full'},{...doc.basic,name:'欧阳娜娜'}),'OUYANG NANA');assert.equal(cardName({...options,nameMode:'custom',nameText:'Chong Yang'},doc.basic),'CHONG YANG');assert.ok(Yearbook.validate({...options,format:'card',nameMode:'custom',nameText:''},doc.basic,namePinyin));assert.ok(Yearbook.validate({...options,format:'card',nameMode:'english'},{...doc.basic,englishName:'A'.repeat(41)},namePinyin));assert.ok(Yearbook.validate({...options,format:'card',mottoId:'custom',mottoText:'一\n二\n三'},doc.basic,namePinyin));
 const ai:PortraitAsset={id:crypto.randomUUID(),parentId:crop.parentId,sourceId:crop.id,kind:'ai',blob:crop.blob,width:32,height:40},card:PortraitAsset={...ai,id:crypto.randomUUID(),kind:'card',sourceId:ai.id};const next=editDocument(doc,d=>{d.portrait.appliedAssetId=card.id;d.portrait.yearbook={...options,format:'card',nameMode:'custom',nameText:'Fictional'};});await draft.apply(next,'portrait',doc.revision,[ai,card]);await draft.save('snapshot');assert.equal(Object.keys((await store.load()).assets).length,4);
 const snapshot=draft.getSnapshot().history.find(h=>h.document.portrait.appliedAssetId===card.id)!;draft.edit(d=>{d.portrait.appliedAssetId=crop.id;});await draft.save();await draft.save('restore',snapshot);assert.equal(draft.getSnapshot().document!.portrait.appliedAssetId,card.id);await draft.save('clear');assert.equal(Object.keys((await store.load()).assets).length,0);
 const dangling=editDocument((await store.load()).document!,d=>{d.portrait.originalAssetId=crypto.randomUUID();d.portrait.appliedAssetId=crypto.randomUUID();});await assert.rejects(store.commit(dangling,0));
 assert.match(portraitPrompt({style:'yearbook-female',options:{...options,presentation:'female'}}),/不添加姓名/);assert.match(portraitPrompt({style:'editorial',options}),/编辑肖像/);
});

test('D SIM-018/019: cancel/reconfigure/expiry of a real codec probe suppresses late success and clears all credentials independently',async t=>{
 let release!:(value:unknown)=>void,entered=false,signal:AbortSignal|undefined,enteredSignal=()=>{};let now=Date.now();t.mock.method(Date,'now',()=>now);
 const app=await buildApp(false,undefined,{image:async(_config,_images,_prompt,s)=>{entered=true;signal=s;enteredSignal();return new Promise(resolve=>{release=resolve;});}});t.after(()=>app.close());
 const first=await app.inject({url:'/api/session',headers:{host:'127.0.0.1:4173'}}),headers={host:'127.0.0.1:4173',origin:'http://127.0.0.1:4173',cookie:String(first.headers['set-cookie']).split(';')[0],'x-csrf-token':first.json().csrfToken};
 for(const mode of ['cancel','replace','expire']){
  entered=false;const ready=new Promise<void>(resolve=>{enteredSignal=resolve;});await app.inject({method:'PUT',url:'/api/connections/image',headers,payload:config});const session=(await app.inject({url:'/api/session',headers})).json(),requestId=crypto.randomUUID();
  const pending=app.inject({method:'POST',url:'/api/connections/image/test',headers,payload:{connectionId:session.imageConnection.id,requestId,multiple:false}}).then(response=>response);
  try{await Promise.race([ready,pending.then(response=>{throw new Error('Probe ended before provider: '+response.statusCode);})]);assert.ok(entered);
   if(mode==='cancel')await app.inject({method:'POST',url:'/api/ai/portrait/cancel',headers,payload:{requestId}});
   if(mode==='replace')await app.inject({method:'PUT',url:'/api/connections/image',headers,payload:{...config,model:'fictional-new'}});
   if(mode==='expire')now+=8*60*60*1000;
   release({data:[{b64_json:image.base64}]});const response=await pending;assert.equal(response.statusCode,mode==='expire'?401:499,response.body);assert.equal(signal?.aborted,true);
   const updated=(await app.inject({url:'/api/session',headers})).json();assert.notEqual(updated.connections.image,'connected');
  }finally{release?.({data:[{b64_json:image.base64}]});}
 }
});

test('D SIM-018: late failure of old cancel request cannot replace a new candidate message',async t=>{
 const {draft,crop}=await local(t);let failCancel!:(error:Error)=>void;
 const started:PortraitInput[]=[];let release!:(value:unknown)=>void;
 const assistant=new PortraitAssistant(draft,{write:(path,body)=>path.endsWith('cancel')?new Promise((_resolve,reject)=>{failCancel=reject;}):new Promise(resolve=>{started.push(body as PortraitInput);release=resolve;})},decode);t.after(()=>assistant.dispose());
 const first=assistant.generate(crop,null,'sky',options,crypto.randomUUID());while(started.length<1)await new Promise(resolve=>setImmediate(resolve));const finishFirst=release;assistant.cancel();
 const second=assistant.generate(crop,null,'gray',options,crypto.randomUUID());while(started.length<2)await new Promise(resolve=>setImmediate(resolve));release(result(started[1]));await second;const current=assistant.getSnapshot();failCancel(new Error('FICTIONAL_OLD_CANCEL_FAILURE'));await new Promise(resolve=>setImmediate(resolve));assert.equal(assistant.getSnapshot(),current);finishFirst(result(started[0]));await first;
});

test('VPN download recovery: actual portrait assistant sends no photos or generation request, preserves revision and still requires adoption',async t=>{
 const {draft,crop,current}=await local(t),requestId=crypto.randomUUID(),pendingId=crypto.randomUUID();
 const paths:string[]=[];
 const assistant=new PortraitAssistant(draft,{write:async(path,body)=>{
  paths.push(path);assert.equal(path,'/api/connections/image/retry-download');const input=body as {requestId:string;pendingId:string;vpnCompatibility:boolean};assert.equal(input.pendingId,pendingId);assert.equal(input.vpnCompatibility,true);assert.ok(!JSON.stringify(body).includes('base64'));
  return {requestId:input.requestId,documentId:current.id,baseRevision:current.revision,sourceAssetId:crop.id,style:'sky',image:{base64:image.base64,width:32,height:40}};
 }},decode);t.after(()=>assistant.dispose());
 await assistant.generate(crop,null,'sky',options,crypto.randomUUID(),{pendingId,requestId,vpnCompatibility:true});
 assert.ok(assistant.getSnapshot().candidate);assert.equal(draft.getSnapshot().document!.portrait.appliedAssetId,crop.id);
 draft.edit(doc=>{doc.basic.role='新的虚构岗位';});
 await assistant.generate(crop,null,'sky',options,crypto.randomUUID(),{pendingId,requestId,vpnCompatibility:true});
 assert.equal(assistant.getSnapshot().candidate,null);assert.match(assistant.getSnapshot().error,/版本或来源不匹配/);assert.equal(paths.length,2);
});


test('Template mode: requires two ordered inputs, keeps template styling prompt separate and announces workflow version',async t=>{
 const calls:{count:number;prompt:string}[]=[];
 const app=await buildApp(false,undefined,{image:async(_config,images,prompt)=>{calls.push({count:images.length,prompt});return {data:[{b64_json:images[0].base64}]};}});t.after(()=>app.close());
 const first=await app.inject({url:'/api/session',headers:{host:'127.0.0.1:4173'}});assert.equal(first.json().portraitWorkflow,'template-v2');
 const headers={host:'127.0.0.1:4173',origin:'http://127.0.0.1:4173',cookie:String(first.headers['set-cookie']).split(';')[0],'x-csrf-token':first.json().csrfToken};
 await app.inject({method:'PUT',url:'/api/connections/image',headers,payload:config});const session=(await app.inject({url:'/api/session',headers})).json(),connectionId=session.imageConnection.id;
 await app.inject({method:'POST',url:'/api/connections/image/test',headers,payload:{connectionId,requestId:crypto.randomUUID(),multiple:true}});
 const input={connectionId,requestId:crypto.randomUUID(),documentId:crypto.randomUUID(),baseRevision:2,sourceAssetId:crypto.randomUUID(),style:'template-female',templateDigest:'a'.repeat(64),options:{presentation:options.presentation,outfit:options.outfit,hair:options.hair,retouch:options.retouch,background:options.background},images:[image,image]};
 const before=calls.length;
 for(const bad of [{...input,images:[image]},{...input,templateDigest:undefined}])assert.equal((await app.inject({method:'POST',url:'/api/ai/portrait',headers,payload:bad})).statusCode,400);
 assert.equal(calls.length,before);
 const response=await app.inject({method:'POST',url:'/api/ai/portrait',headers,payload:input});assert.equal(response.statusCode,200,response.body);assert.equal(response.json().templateDigest,input.templateDigest);assert.equal(calls.at(-1)!.count,2);
 assert.match(calls.at(-1)!.prompt,/图2.*身份参考/);assert.match(calls.at(-1)!.prompt,/图1.*最终底图/);assert.doesNotMatch(calls.at(-1)!.prompt,/保留原发长|保留原发型/);
});

test('Template candidate binds source and template; atomic adoption, restore and cleanup retain correct template',async t=>{
 const {draft,store,crop}=await local(t);const reference=new Blob([new Uint8Array(png('#123456'))],{type:'image/png'}),digest=await templateDigest(reference);
 const assistant=new PortraitAssistant(draft,{write:async(_path,body)=>{const input=body as PortraitInput;assert.equal(input.images.length,2);assert.equal(input.images[0].base64,image.base64);assert.equal(input.templateDigest,digest);return {...result(input),templateDigest:digest};}},decode);t.after(()=>assistant.dispose());
 await assistant.generate(crop,null,'template-female',options,crypto.randomUUID());assert.match(assistant.getSnapshot().error,/模板/);
 await assistant.generate(crop,reference,'template-female',options,crypto.randomUUID());assert.ok(assistant.getSnapshot().candidate?.template);assert.equal(draft.getSnapshot().document!.portrait.appliedAssetId,crop.id);
 await assistant.apply(options);await draft.save('snapshot');const applied=await store.load(),ai=applied.assets[applied.document!.portrait.appliedAssetId!];assert.equal(applied.assets[ai.templateId!].kind,'template');assert.equal(await applied.assets[ai.templateId!].blob.text(),await reference.text());
 const snapshot=applied.history.find(h=>h.document.portrait.appliedAssetId===ai.id)!;
 draft.edit(d=>{d.portrait.appliedAssetId=crop.id;});await draft.save();await draft.save('restore',snapshot);assert.ok((await store.load()).assets[ai.templateId!]);
 await draft.save('clear');assert.equal(Object.keys((await store.load()).assets).length,0);
});

test('Template download from a different template is rejected before candidate is exposed',async t=>{
 const {draft,crop}=await local(t),reference=crop.blob;
 const assistant=new PortraitAssistant(draft,{write:async(_path,body)=>({...result(body as PortraitInput),templateDigest:'f'.repeat(64)})},decode);t.after(()=>assistant.dispose());
 await assistant.generate(crop,reference,'template-male',options,crypto.randomUUID());assert.equal(assistant.getSnapshot().candidate,null);assert.match(assistant.getSnapshot().error,/版本或来源不匹配/);
});


test('local final face restoration makes no extra AI request, rejects stale candidates and persists the restoration flag',async t=>{
 const {draft,store,crop}=await local(t);let calls=0;
 const assistant=new PortraitAssistant(draft,{write:async(_path,body)=>{calls++;return result(body as PortraitInput);}},decode);t.after(()=>assistant.dispose());
 await assistant.generate(crop,null,'sky',options,crypto.randomUUID());const candidate=assistant.getSnapshot().candidate!,base={id:candidate.documentId,revision:candidate.baseRevision,requestId:candidate.requestId},blob=new Blob([new Uint8Array(png('#f5abcd'))],{type:'image/png'});
 await assert.rejects(assistant.restoreOriginalFace(blob,{...base,requestId:crypto.randomUUID()}),/变化/);assert.equal(assistant.getSnapshot().candidate,candidate);
 await assistant.restoreOriginalFace(blob,base);assert.equal(calls,1);assert.equal(assistant.getSnapshot().candidate?.blob,blob);assert.equal(assistant.getSnapshot().candidate?.faceRestored,true);assert.equal(assistant.getSnapshot().candidate?.generatedBlob,candidate.blob);assert.equal(draft.getSnapshot().document!.portrait.appliedAssetId,crop.id);
 await assistant.apply(options);const loaded=await store.load();assert.equal(loaded.assets[loaded.document!.portrait.appliedAssetId!].faceRestored,true);assert.equal(loaded.document!.confirmedRevision,null);
 await assert.rejects(assistant.restoreOriginalFace(blob,base),/变化/);
});


test('local candidate recovery keeps original ancestry, makes no API calls and rejects stale imports',async t=>{
 const {draft,crop,current,store}=await local(t);let calls=0;
 const assistant=new PortraitAssistant(draft,{write:async()=>{calls++;throw new Error('must not call provider');}},decode);t.after(()=>assistant.dispose());
 const blob=new Blob([new Uint8Array(png('#345'))],{type:'image/png'});
 await assistant.importCandidate(blob,crop);
 assert.equal(calls,0);assert.equal(draft.getSnapshot().document!.portrait.appliedAssetId,crop.id);
 assert.equal(assistant.getSnapshot().candidate!.blob,blob);
 await assistant.apply(options);
 const saved=await store.load(),asset=saved.assets[saved.document!.portrait.appliedAssetId!];
 assert.equal(asset.kind,'ai');assert.equal(asset.sourceId,crop.id);assert.equal(asset.parentId,current.portrait.originalAssetId);
 assert.ok(saved.assets[crop.id]);assert.equal(calls,0);
 let release!:(bitmap:ImageBitmap)=>void;
 const delayed=new PortraitAssistant(draft,{write:async()=>{calls++;}},()=>new Promise(resolve=>{release=resolve;}));t.after(()=>delayed.dispose());
 const pending=delayed.importCandidate(blob,crop);
 draft.edit(d=>{d.basic.location='虚构城市';});release(await decode());await pending;
 assert.equal(delayed.getSnapshot().candidate,null);assert.equal(calls,0);
 const broken=new PortraitAssistant(draft,{write:async()=>{calls++;}},async()=>{throw new Error('invalid file');});t.after(()=>broken.dispose());
 await broken.importCandidate(blob,crop);assert.match(broken.getSnapshot().error,/invalid file/);assert.equal(broken.getSnapshot().candidate,null);assert.equal(calls,0);
});

test('background portrait survives component disposal; resume only reads status, retains template and rejects stale draft',async t=>{
 const {draft,crop}=await local(t);let started!:()=>void;const ready=new Promise<void>(resolve=>{started=resolve;});let release!:()=>void,completed=false,task:any,posts=0,cancels=0;
 const api={write:async(path:string,body:any)=>{
  if(path==='/api/ai/portrait/tasks'){posts++;const {images:_images,connectionId:_connectionId,requestId,...metadata}=body;task={id:requestId,...metadata,phase:'waiting',startedAt:Date.now(),expiresAt:Date.now()+900000};return {task};}
  if(path==='/api/ai/portrait/cancel'){cancels++;return {};}
  if(path==='/api/ai/portrait/tasks/status'){if(!completed){started();await new Promise<void>(resolve=>{release=resolve;});}return {task:{...task,phase:completed?'succeeded':'waiting'},...(completed?{result:{...result({...task,requestId:task.id}),templateDigest:task.templateDigest},template:{base64:image.base64,width:32,height:40}}:{})};}
  throw new Error('unexpected endpoint');
 }};
 const first=new PortraitAssistant(draft,api,decode);t.after(()=>first.dispose());const options=Yearbook.normalize();const pending=first.generate(crop,crop.blob,'template-female',options,crypto.randomUUID(),undefined,true);await ready;first.dispose();release();await pending;assert.equal(cancels,0);assert.equal(posts,1);
 completed=true;const second=new PortraitAssistant(draft,api,decode);t.after(()=>second.dispose());await second.resume(task,crypto.randomUUID());assert.ok(second.getSnapshot().candidate?.template);assert.equal(posts,1);assert.equal(draft.getSnapshot().document!.portrait.appliedAssetId,crop.id);
 await second.apply(options);assert.equal(draft.getSnapshot().assets[draft.getSnapshot().document!.portrait.appliedAssetId!].kind,'ai');assert.equal(posts,1);
 const stale=new PortraitAssistant(draft,api,decode);t.after(()=>stale.dispose());await stale.resume(task,crypto.randomUUID());assert.equal(stale.getSnapshot().candidate,null);assert.equal(posts,1);
});
