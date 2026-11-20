import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { zipSync,strToU8 } from 'fflate';
import 'fake-indexeddb/auto';
import { validateFile,extractDocx,zipDirectory,buildDraft,IMPORT_LIMITS } from '../client/import/core.js';
import { extractPdf } from '../client/import/pdf.js';
import { DraftStore } from '../client/storage.js';
import { DraftSession } from '../client/draft-session.js';
import { emptyDocument,editDocument,styles,layouts } from '../shared/schemas.js';
import { imageSize,cropGeometry } from '../client/portrait/image.js';
import { planResume,wrapText,PAGE } from '../client/render/pages.js';
import type { PortraitAsset } from '../client/portrait/assets.js';
const mainType='<Types><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>';
const word=(text:string)=>`<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>${text}</w:t></w:r></w:p></w:body></w:document>`;
function docx(xml=word('虚构正文'),extra:Record<string,Uint8Array>={}){return zipSync({'[Content_Types].xml':strToU8(mainType),'word/document.xml':strToU8(xml),...extra});}
test('SIM-003/004: 20 real Chinese DOCX fixtures preserve all original text, facts, unknown content and order',async()=>{
    const expected: {file:string;lines:string[];name:string}[]=JSON.parse(await readFile(new URL('./fixtures/expected.json',import.meta.url),'utf8'));
    for(const sample of expected){const bytes=new Uint8Array(await readFile(new URL(`./fixtures/${sample.file}`,import.meta.url)));assert.equal(validateFile(bytes,sample.file,'application/vnd.openxmlformats-officedocument.wordprocessingml.document'),'docx');const extracted=extractDocx(bytes);assert.equal(extracted.text,sample.lines.join('\n'));const before=emptyDocument();before.basic.name='MUST_NOT_LEAK_OLD_NAME';const draft=buildDraft(extracted,before);assert.equal(draft.basic.name,sample.name);assert.equal(draft.sourceText,extracted.text);assert.ok(draft.sections.find(s=>s.id==='unknown')?.text.includes('FICTIONAL_INJECTION'));assert.ok(!JSON.stringify(draft).includes('MUST_NOT_LEAK_OLD_NAME'));assert.equal(before.basic.name,'MUST_NOT_LEAK_OLD_NAME');}
});
test('SIM-003/005: real PDF.js reads Chinese facts; corrupt, empty and disguised files fail',async()=>{
    const bytes=new Uint8Array(await readFile(new URL('./fixtures/fictional-resume.pdf',import.meta.url)));
    assert.equal(validateFile(bytes,'虚构.pdf','application/pdf'),'pdf');const extracted=await extractPdf(bytes,process.cwd()+'/node_modules/pdfjs-dist/');const doc=buildDraft(extracted,emptyDocument());assert.equal(doc.basic.name,'虚构测试甲');assert.ok(doc.sourceText.includes('虚构示范大学'));assert.ok(extracted.lines.every(l=>l.ref.startsWith('page:')));
    assert.throws(()=>validateFile(bytes,'伪装.docx','application/pdf'),/不匹配/);assert.throws(()=>validateFile(new Uint8Array(),'empty.pdf','application/pdf'),/为空/);assert.throws(()=>validateFile(new Uint8Array(IMPORT_LIMITS.bytes+1),'large.pdf','application/pdf'),/15 MiB/);
    await assert.rejects(extractPdf(strToU8('%PDF-1.7\ninvalid'),process.cwd()+'/node_modules/pdfjs-dist/'),/损坏/);
});
test('SIM-005/029: DOCX actual ZIP/XML boundaries reject CRC corruption, paths, nested archives, macros, entities and excess inflation',()=>{
    assert.throws(()=>extractDocx(docx(word('test'),{'../escape.xml':strToU8('bad')})),/路径/);
    assert.throws(()=>extractDocx(docx(word('test'),{'nested.zip':strToU8('bad')})),/压缩/);
    assert.throws(()=>extractDocx(docx(word('test'),{'word/vbaProject.bin':strToU8('bad')})),/可执行/);
    assert.throws(()=>extractDocx(docx('<!DOCTYPE document [<!ENTITY x "test">]>'+word('&x;'))),/实体/);
    assert.throws(()=>extractDocx(docx(word('x'.repeat(20001)))),/20000/);
    const corrupt=docx();const directory=zipDirectory(corrupt);assert.equal(directory.size,2);const view=new DataView(corrupt.buffer);for(let i=0;i<corrupt.length-46;i++)if(view.getUint32(i,true)===0x02014b50){view.setUint32(i+16,123,true);break;}assert.throws(()=>extractDocx(corrupt),/声明/);
    const inflated=docx();const v=new DataView(inflated.buffer);for(let i=0;i<inflated.length-46;i++)if(v.getUint32(i,true)===0x02014b50){v.setUint32(i+24,IMPORT_LIMITS.inflated+1,true);break;}assert.throws(()=>extractDocx(inflated),/50 MiB/);
    const relationships='<Relationships><Relationship TargetMode="External" Type="hyperlink" Target="https://example.com"/></Relationships>';
    assert.equal(extractDocx(docx(word('保留链接文字'),{'word/_rels/document.xml.rels':strToU8(relationships)})).text,'保留链接文字');
});
test('SIM-009/015/021/022: assets and history commit atomically; shared photos survive deletion/restoration; clear removes all',async()=>{
    const store=await DraftStore.open(`fictional-b-${crypto.randomUUID()}`),doc=emptyDocument();await store.commit(doc,null);
    const original:PortraitAsset={id:crypto.randomUUID(),parentId:null,kind:'original',blob:new Blob(['fictional'],{type:'image/png'}),width:2,height:2};
    const crop:PortraitAsset={...original,id:crypto.randomUUID(),parentId:original.id,kind:'crop'};
    const photo=editDocument(doc,d=>{d.portrait.originalAssetId=original.id;d.portrait.appliedAssetId=crop.id;});
    const put=IDBObjectStore.prototype.put;let calls=0;IDBObjectStore.prototype.put=function(...args:Parameters<typeof put>){if(++calls===3)throw new DOMException('fictional quota','QuotaExceededError');return put.apply(this,args);};
    try{await assert.rejects(store.commit(doc,0,'portrait',undefined,{replacement:photo,assets:[original,crop]}));}finally{IDBObjectStore.prototype.put=put;}
    assert.equal((await store.load()).document?.revision,0);assert.equal(Object.keys((await store.load()).assets).length,0);
    const applied=await store.commit(doc,0,'portrait',undefined,{replacement:photo,assets:[original,crop]});const saved=await store.commit(photo,1,'snapshot');
    const removed=await store.commit(photo,1,'delete',saved.history[0]);assert.equal(Object.keys(removed.assets??{}).length,2);
    const noPhoto=editDocument(photo,d=>{d.portrait.originalAssetId=null;d.portrait.appliedAssetId=null;});await store.commit(noPhoto,1);
    const restored=await store.commit(noPhoto,2,'restore',applied.history[0]);assert.equal(restored.document.portrait.appliedAssetId,crop.id);assert.equal(restored.history[0].document.portrait.appliedAssetId,null);
    const cleared=await store.commit(restored.document,3,'clear');assert.equal(cleared.history.length,0);assert.equal(Object.keys(cleared.assets??{}).length,0);assert.notEqual(cleared.document.id,doc.id);store.close();
});
test('SIM-012/023/024: import/apply stale results cannot override edits; confirm invalidates after edits and snapshots retain facts',async()=>{
    const store=await DraftStore.open(`fictional-b-${crypto.randomUUID()}`),doc=emptyDocument();doc.basic.name='虚构';doc.sections[0].text='虚构事实';await store.commit(doc,null);const session=new DraftSession();session.attach(store,doc,[],true);
    const extracted=extractDocx(docx(word('姓名：新的虚构姓名')));const replacement=buildDraft(extracted,doc);session.edit(d=>{d.basic.role='虚构新编辑';});await assert.rejects(session.apply(replacement,'import',0),/过期/);assert.equal(session.getSnapshot().document?.basic.role,'虚构新编辑');
    await session.save('confirm');const confirmed=session.getSnapshot().document!;assert.equal(confirmed.confirmedRevision,1);const bound=structuredClone(confirmed);session.edit(d=>{d.presentation.styleId='tokyo';});assert.equal(session.getSnapshot().document?.confirmedRevision,null);assert.equal(bound.presentation.styleId,'editorial');assert.equal(bound.confirmedRevision,1);session.dispose();store.close();
});
test('SIM-014/015: crop rotation/pan clamps exactly, image headers reject excessive pixels and wrong signatures',()=>{
    const png=new Uint8Array(24);png.set([137,80,78,71,13,10,26,10]);png.set(strToU8('IHDR'),12);const view=new DataView(png.buffer);view.setUint32(16,600);view.setUint32(20,800);assert.deepEqual(imageSize(png,'image/png'),{width:600,height:800});view.setUint32(16,24000001);assert.throws(()=>imageSize(png,'image/png'),/像素/);assert.throws(()=>imageSize(strToU8('<svg/>'),'image/png'),/签名/);
    const config={x:10,y:-10,zoom:2,rotation:90,ratio:'3:4' as const};const a=cropGeometry(600,800,360,480,config),b=cropGeometry(600,800,720,960,config);assert.equal(a.crop.x,b.crop.x);assert.equal(a.crop.y,b.crop.y);assert.equal(b.scale,a.scale*2);assert.throws(()=>cropGeometry(600,800,360,480,{...config,zoom:Infinity}),/参数/);
});
test('SIM-006/025: all layouts/styles paginate long mixed text without loss or out-of-page body lines; titles stay with first paragraph',()=>{
    const measure={font:'',measureText:(text:string)=>({width:Array.from(text).reduce((sum,c)=>sum+(c.charCodeAt(0)>255?16:8),0)})};
    const value=Array.from({length:150},(_,i)=>`虚构长项目 ${i+1}，保留成果数字 ${i+1}。 LongWord${'x'.repeat(i%20)}\n第二行事实。`).join('\n\n');
    for(const styleId of styles)for(const layoutId of layouts){const doc=emptyDocument();doc.basic.name='虚构排版测试';doc.presentation.styleId=styleId;doc.presentation.layoutId=layoutId;doc.sections.find(s=>s.id==='project')!.text=value;const pages=planResume(doc,measure);assert.ok(pages.length>1&&pages.length<=30);const texts=pages.flat().filter(draw=>draw.kind==='text');const body=texts.filter(draw=>draw.role==='content');assert.equal(body.map(draw=>draw.text).join('').replace(/\s/g,''),value.replace(/\s/g,''));assert.ok(body.every(draw=>draw.x>=44&&draw.y<PAGE.height-55));
        for(const page of pages){const titles=page.filter(draw=>draw.kind==='text'&&draw.text.includes('项目经历'));assert.ok(!titles.length||page.some(draw=>draw.kind==='text'&&draw.role==='content'),'no orphan heading');}}
    assert.equal(wrapText('超长中英Word123',20,text=>text.length*10).join(''),'超长中英Word123');
});

test('SIM-015/021: missing historical photo blocks restore and preserves current text and references',async()=>{
    const name=`fictional-missing-${crypto.randomUUID()}`,store=await DraftStore.open(name),doc=emptyDocument();await store.commit(doc,null);
    const original:PortraitAsset={id:crypto.randomUUID(),parentId:null,kind:'original',blob:new Blob(['fictional'],{type:'image/png'}),width:2,height:2},crop:PortraitAsset={...original,id:crypto.randomUUID(),kind:'crop',parentId:original.id};
    const photo=editDocument(doc,d=>{d.portrait.originalAssetId=original.id;d.portrait.appliedAssetId=crop.id;});const applied=await store.commit(doc,0,'portrait',undefined,{replacement:photo,assets:[original,crop]});
    const raw=await new Promise<IDBDatabase>((resolve,reject)=>{const request=indexedDB.open(name);request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});
    await new Promise<void>((resolve,reject)=>{const tx=raw.transaction('state','readwrite');tx.objectStore('state').put({[original.id]:original},'assets');tx.oncomplete=()=>resolve();tx.onabort=()=>reject(tx.error);});
    const current=editDocument(photo,d=>{d.basic.name='虚构当前编辑';d.portrait.originalAssetId=null;d.portrait.appliedAssetId=null;});await store.commit(current,1);
    await assert.rejects(store.commit(current,2,'restore',applied.history[0]),/照片资产缺失/);assert.deepEqual((await store.load()).document,current);raw.close();store.close();
});
test('SIM-003/021: successful import atomically backs up prior facts and preserves chosen style/layout',async()=>{
    const store=await DraftStore.open(`fictional-import-${crypto.randomUUID()}`),doc=emptyDocument();doc.basic.name='虚构原版本';doc.presentation.styleId='atelier';doc.presentation.layoutId='sidebar-right';await store.commit(doc,null);
    const replacement=buildDraft(extractDocx(docx(word('姓名：虚构新版本'))),doc);const applied=await store.commit(doc,0,'import',undefined,{replacement});
    assert.equal(applied.document.basic.name,'虚构新版本');assert.equal(applied.document.presentation.styleId,'atelier');assert.equal(applied.document.presentation.layoutId,'sidebar-right');assert.equal(applied.history.find(s=>s.source==='before-import')?.document.basic.name,'虚构原版本');assert.equal((await store.load()).document?.revision,1);store.close();
});

test('SIM-026: partial object-URL creation failure revokes previous links',async()=>{
    const {imageLinks}=await import('../client/render/browser.js');const create=URL.createObjectURL,revoke=URL.revokeObjectURL;let calls=0;const revoked:string[]=[];
    URL.createObjectURL=()=>{if(++calls===2)throw new Error('FICTIONAL_ALLOCATION_FAILURE');return 'blob:fictional-first';};URL.revokeObjectURL=value=>{revoked.push(value);};
    try{assert.throws(()=>imageLinks([new Blob(['one']),new Blob(['two'])]),/ALLOCATION/);assert.deepEqual(revoked,['blob:fictional-first']);}finally{URL.createObjectURL=create;URL.revokeObjectURL=revoke;}
});

test('SIM-003/004: real graduate/social PDFs cover two columns and multiple pages, with original facts and page references',async()=>{
    const samples:{file:string;name:string;lines:string[];pages:number}[]=JSON.parse(await readFile(new URL('./fixtures/expected-pdfs.json',import.meta.url),'utf8'));
    for(const sample of samples){const bytes=new Uint8Array(await readFile(new URL(`./fixtures/${sample.file}`,import.meta.url)));const extracted=await extractPdf(bytes,process.cwd()+'/node_modules/pdfjs-dist/');const doc=buildDraft(extracted,emptyDocument());assert.equal(doc.basic.name,sample.name);assert.deepEqual(extracted.lines.map(line=>line.text),sample.lines);assert.equal(doc.sourceText,sample.lines.join('\n'));assert.ok(extracted.lines.some(line=>line.ref.startsWith(`page:${sample.pages}:`)));assert.ok(doc.sections.find(section=>section.id==='unknown')?.text.includes('仅为测试'));}
});
