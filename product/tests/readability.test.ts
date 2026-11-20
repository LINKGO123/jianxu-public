import test from 'node:test';
import 'fake-indexeddb/auto';
import assert from 'node:assert/strict';
import {createCanvas} from '@napi-rs/canvas';
import {contentBlocks} from '../client/render/structure.js';
import {emptyDocument,editDocument,documentSchema,styles,layouts} from '../shared/schemas.js';
import {planResume,PAGE} from '../client/render/pages.js';

const resume='虚构科技有限公司 2021/3—2025/6 培训主管\n公司介绍：仅供测试的虚构机构。\n项目一：课程开发\n1. 需求分析：完成12次虚构访谈。\n2. 项目成果：覆盖100位虚构学员。\n\n虚构学校 2018—2021 讲师\n保留未识别原文，不推断事实。';
test('company/project/note/list classification preserves every source line and respects user corrections',()=>{
 const doc=emptyDocument(),section=doc.sections.find(s=>s.id==='work')!;section.text=resume;
 const blocks=contentBlocks(section);
 assert.deepEqual(blocks.map(b=>b.kind),['company','note','project','bullet','bullet','company','body']);
 assert.equal(blocks.map(b=>b.text).join('\n'),resume.replace(/\n\n/g,'\n'));
 section.formatting=[{line:2,kind:'body'}];assert.equal(contentBlocks(section)[2].kind,'body');
 const edited=editDocument(doc,d=>{d.sections.find(s=>s.id==='work')!.text+='\n新文字';});assert.equal(edited.sections.find(s=>s.id==='work')!.formatting,undefined);
 const unchanged=editDocument(doc,d=>{d.basic.role='虚构岗位';});assert.deepEqual(unchanged.sections.find(s=>s.id==='work')!.formatting,section.formatting);
 assert.throws(()=>documentSchema.parse({...doc,sections:doc.sections.map(s=>s.id==='work'?{...s,formatting:[{line:999,kind:'body'}]}:s)}));
});

test('reading hierarchy and pagination keep facts across all styles/layouts, with no orphan titles or overflow',()=>{
 const doc=emptyDocument();doc.basic.name='虚构阅读测试';doc.basic.role='培训主管';doc.sections.find(s=>s.id==='work')!.text=Array.from({length:8},()=>resume).join('\n\n');
 const original=structuredClone(doc.sections),ctx=createCanvas(794,1123).getContext('2d');
 for(const styleId of styles)for(const layoutId of layouts){
  doc.presentation.styleId=styleId;doc.presentation.layoutId=layoutId;
  const pages=planResume(doc,ctx),all=pages.flat(),body=all.filter(d=>d.kind==='text'&&d.role==='content');
  assert.equal(body.map(d=>d.kind==='text'?d.text:'').join('').replace(/\s/g,''),doc.sections.find(s=>s.id==='work')!.text.replace(/\s/g,''));
  assert.ok(body.some(d=>d.kind==='text'&&d.weight===700));assert.ok(body.some(d=>d.kind==='text'&&d.size>=14&&d.weight===400));
  for(const page of pages){const content=page.filter(d=>d.kind==='text'&&d.role==='content');assert.ok(content.length>0);for(const d of page)if(d.kind==='text'){ctx.font=`${d.weight} ${d.size}px ${d.font}`;assert.ok(d.x+ctx.measureText(d.text).width<=PAGE.width-PAGE.padding+1,JSON.stringify(d));assert.ok(d.y<=PAGE.height-26);}}
 }
 assert.deepEqual(doc.sections,original);
});

test('portrait source follows lineage to original crop instead of repeatedly redrawing AI or sending a PDF page',async()=>{
 const {portraitSources}=await import('../client/portrait-ai/sources.js');
 const doc=emptyDocument(),blob=new Blob(['fictional'],{type:'image/png'}),root={id:crypto.randomUUID(),parentId:null,kind:'original' as const,blob,width:347,height:347},crop={...root,id:crypto.randomUUID(),parentId:root.id,kind:'crop' as const,width:720,height:960},ai={...crop,id:crypto.randomUUID(),kind:'ai' as const,sourceId:crop.id},ai2={...ai,id:crypto.randomUUID(),sourceId:ai.id},card={...ai2,id:crypto.randomUUID(),kind:'card' as const,sourceId:ai2.id};
 doc.portrait={...doc.portrait,originalAssetId:root.id,appliedAssetId:card.id,crop:{x:0,y:0,zoom:1,rotation:0,ratio:'3:4'}};
 const assets=Object.fromEntries([root,crop,ai,ai2,card].map(a=>[a.id,a]));const sources=portraitSources(doc,assets);
 assert.equal(sources.current?.id,ai2.id);assert.equal(sources.original?.id,crop.id);assert.ok(sources.originalResolution!.height<=347);
 delete (assets[ai.id] as {sourceId?:string}).sourceId;assert.equal(portraitSources(doc,assets).original,null);
});

test('history restores explicit grouping together with older text instead of clearing it as a stale edit',async()=>{
 const {DraftStore}=await import('../client/storage.js');
 const store=await DraftStore.open('fictional-formatting-'+crypto.randomUUID());
 try{
  const doc=emptyDocument();doc.sections[1].text=resume;doc.sections[1].formatting=[{line:2,kind:'body'}];await store.commit(doc,null);
  const snap=await store.commit(doc,0,'snapshot');const edited=editDocument(doc,d=>{d.sections[1].text+='\n新增内容';});await store.commit(edited,0);
  const restored=await store.commit(edited,1,'restore',snap.history[0]);assert.equal(restored.document.sections[1].text,resume);assert.deepEqual(restored.document.sections[1].formatting,doc.sections[1].formatting);
 }finally{store.close();}
});

test('a new section does not strand its heading before a long company/project opening',()=>{
 const ctx=createCanvas(794,1123).getContext('2d');
 for(let n=22;n<40;n++){
  const doc=emptyDocument();doc.basic.name='虚构分组';doc.sections[0].text=Array.from({length:n},()=> '虚构概述。').join('\n');doc.sections[1].text='虚构'+ '长名称'.repeat(17)+'有限公司 2021—2025 测试岗位\n项目一：'+ '标题'.repeat(35)+'\n1. 完成原文中的事实。\n2. 保留全部成果。';
  for(const page of planResume(doc,ctx)){const heading=page.find(d=>d.kind==='text'&&d.text==='工作经历');if(heading)assert.ok(page.some(d=>d.kind==='text'&&d.role==='content'&&d.y>heading.y),'section heading must share page with content');}
 }
});

test('labelled source paragraphs become readable list entries, and short sections do not split a final item away',()=>{
 const doc=emptyDocument();doc.sections[0].text='体系搭建与运营：保留原文。\n课程产品化开发：保留成果。\n公司介绍 ：保留说明。';assert.deepEqual(contentBlocks(doc.sections[0]).map(b=>b.kind),['bullet','bullet','note']);
 const ctx=createCanvas(794,1123).getContext('2d');doc.basic.name='虚构测试';doc.sections[0].text=Array.from({length:30},()=> '虚构概述。').join('\n');doc.sections[2].text=Array.from({length:4},(_,i)=>`${i+1}. 虚构短项${i+1}成果。`).join('\n');
 const counts=planResume(doc,ctx).map(page=>page.filter(d=>d.kind==='text'&&d.role==='content'&&d.text.includes('虚构短项')).length).filter(Boolean);assert.deepEqual(counts,[4]);
});
