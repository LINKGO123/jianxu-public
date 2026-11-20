import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { zipSync,strToU8 } from 'fflate';
import 'fake-indexeddb/auto';
import { extractDocx,buildDraft } from '../client/import/core.js';
import { ImportSession } from '../client/import/import-session.js';
import { emptyDocument,editDocument,styles,layouts,documentSchema } from '../shared/schemas.js';
import { DraftSession } from '../client/draft-session.js';
import { DraftStore } from '../client/storage.js';
import { planResume,fontCSS,PAGE } from '../client/render/pages.js';
const W='http://schemas.openxmlformats.org/wordprocessingml/2006/main',R='http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const p=(value:string)=>`<w:p><w:r><w:t>${value}</w:t></w:r></w:p>`;
function sample(options:{target?:string;type?:string;mode?:string;extraRel?:string;extraRef?:string;header?:string;body?:string;extra?:Record<string,string>}={}){
    const {target='header1.xml',type=R+'/header',mode='',extraRel='',extraRef='',header=p('姓名：虚构页眉姓名')+p('无标签可见事实'),body=p('教育背景')+p('虚构学校'),extra={}}=options;
    return zipSync(Object.fromEntries(Object.entries({
        '[Content_Types].xml':`<Types><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/header1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml"/><Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/></Types>`,
        'word/document.xml':`<w:document xmlns:w="${W}" xmlns:r="${R}"><w:body>${body}<w:sectPr><w:headerReference r:id="header"/><w:footerReference r:id="footer"/>${extraRef}</w:sectPr></w:body></w:document>`,
        'word/_rels/document.xml.rels':`<Relationships><Relationship Id="header" Type="${type}" Target="${target}" ${mode?`TargetMode="${mode}"`:''}/><Relationship Id="footer" Type="${R}/footer" Target="footer1.xml"/>${extraRel}</Relationships>`,
        'word/header1.xml':`<w:hdr xmlns:w="${W}">${header}</w:hdr>`,'word/footer1.xml':`<w:ftr xmlns:w="${W}">${p('无标签页脚事实')}</w:ftr>`,...extra
    }).map(([name,value])=>[name,strToU8(value)])));
}
test('B-DEF-01: headers/footers retain facts once, part/paragraph locations and unknown grouping',()=>{
    const extracted=extractDocx(sample({extraRef:'<w:headerReference r:id="header"/>'})),doc=buildDraft(extracted,emptyDocument());
    assert.equal(extracted.lines.filter(l=>l.text==='姓名：虚构页眉姓名').length,1);
    assert.deepEqual(extracted.lines.map(l=>l.ref),['word/header1.xml:paragraph:1','word/header1.xml:paragraph:2','word/document.xml:paragraph:1','word/document.xml:paragraph:2','word/footer1.xml:paragraph:1']);
    assert.equal(doc.basic.name,'虚构页眉姓名');assert.match(doc.sections.find(s=>s.id==='unknown')!.text,/无标签可见事实/);assert.match(doc.sections.find(s=>s.id==='unknown')!.text,/无标签页脚事实/);assert.equal(doc.sections.find(s=>s.id==='education')!.text,'虚构学校');
    for(const [i,l] of doc.sourceLocations!.entries())assert.equal(doc.sourceText.slice(l.start,l.end),extracted.lines[i].text);
    assert.match(doc.uncertainties.join(''),/页眉.*页脚/);const invalid=structuredClone(doc);invalid.sourceLocations![0].end=doc.sourceText.length+1;assert.equal(documentSchema.safeParse(invalid).success,false);
});
test('B-DEF-01: malformed/external/missing/wrong/duplicate relationships reject; unused parts stay unused',()=>{
    for(const options of [{target:'../escape.xml'},{target:'%2e%2e/escape.xml'},{target:'https://example.com/header.xml'},{mode:'External'},{target:'missing.xml'},{type:R+'/image'},{extraRel:`<Relationship Id="header" Type="${R}/header" Target="header1.xml"/>`},{extraRef:'<w:headerReference r:id="absent"/>'},{header:'<w:broken'}])assert.throws(()=>extractDocx(sample(options)),/DOCX/);
    assert.ok(!extractDocx(sample({extra:{'word/header-unused.xml':`<w:hdr xmlns:w="${W}">${p('MUST_NOT_READ_UNREFERENCED')}</w:hdr>`}})).text.includes('MUST_NOT_READ_UNREFERENCED'));
    assert.equal(extractDocx(sample({target:'/word/header1.xml'})).lines[0].text,'姓名：虚构页眉姓名');
});
test('B-DEF-01: aggregate text/depth/entity limits persist; unsupported visible-text parts disclosed',()=>{
    assert.throws(()=>extractDocx(sample({header:'<w:sdt>'.repeat(101)+p('虚构')+'</w:sdt>'.repeat(101)})),/嵌套/);
    assert.throws(()=>extractDocx(sample({body:p('文'.repeat(12000)),header:p('页'.repeat(9000))})),/20000/);
    assert.throws(()=>extractDocx(sample({header:'<!DOCTYPE x [<!ENTITY leak "fictional">]>'+p('&leak;')})),/实体/);
    const extracted=extractDocx(sample({extra:{'word/footnotes.xml':`<w:footnotes xmlns:w="${W}">${p('虚构脚注')}</w:footnotes>`},body:'<w:p><w:fldSimple w:instr="PAGE"><w:r><w:t>1</w:t></w:r></w:fldSimple></w:p>'}));
    const doc=buildDraft(extracted,emptyDocument());assert.match(doc.uncertainties.join(''),/脚注/);assert.match(doc.uncertainties.join(''),/动态域/);assert.ok(!extracted.text.includes('虚构脚注'));
});
test('RUN20261029 BUG-001: DOCX CDATA facts are preserved and share the normal text limit',()=>{
    const fact='虚构公司 2021—2025，成果 42；<指令仅是原文> & 保留';
    const body=p('姓名：虚构CDATA')+p('工作经历')+`<w:p><w:r><w:t><![CDATA[${fact}]]></w:t></w:r></w:p>`;
    const extracted=extractDocx(sample({body,header:p('虚构页眉')})),doc=buildDraft(extracted,emptyDocument());
    assert.ok(extracted.text.includes(fact),'CDATA must not silently disappear from source facts');
    assert.equal(doc.sections.find(s=>s.id==='work')!.text,fact);
    assert.ok(doc.sourceLocations!.some(location=>doc.sourceText.slice(location.start,location.end)===fact));
    assert.throws(()=>extractDocx(sample({body:`<w:p><w:r><w:t><![CDATA[${'文'.repeat(20001)}]]></w:t></w:r></w:p>`})),/20000/);
});
class Transport {
    static instances:Transport[]=[];onmessage:((event:MessageEvent)=>void)|null=null;onerror:(()=>void)|null=null;terminated=false;
    constructor(){Transport.instances.push(this);}postMessage(){}terminate(){this.terminated=true;}
    reply(name:string){const lines=[{text:`姓名：${name}`,ref:'word/document.xml:paragraph:1'},{text:'工作经历',ref:'word/document.xml:paragraph:2'},{text:'虚构事实',ref:'word/document.xml:paragraph:3'}];this.onmessage?.({data:{ok:true,extracted:{text:lines.map(l=>l.text).join('\n'),lines,warnings:['虚构部件遗漏提示']}}} as MessageEvent);}
}
const file=new File(['fictional'],'fictional.docx');
async function flush(){for(let i=0;i<16;i++)await Promise.resolve();}
function worker(){const original=Object.getOwnPropertyDescriptor(globalThis,'Worker');Transport.instances=[];Object.defineProperty(globalThis,'Worker',{value:Transport,configurable:true});return()=>{if(original)Object.defineProperty(globalThis,'Worker',original);else Reflect.deleteProperty(globalThis,'Worker');};}
function deferred(){let resolve!:()=>void;const promise=new Promise<void>(res=>{resolve=res;});return {promise,resolve};}
test('B-DEF-03: entry parsing cancel/reselect/stale-edit/leave/failure/retry follow actual phase',async()=>{
    const restore=worker(),task=new ImportSession();let current=emptyDocument(),applications=0;const apply=async(next:typeof current)=>{current=next;applications++;};
    try{
        const first=task.load(file,()=>current,apply);await flush();const old=Transport.instances.at(-1)!;assert.equal(task.cancel(),true);old.reply('旧取消');assert.equal(await first,false);assert.equal(applications,0);assert.equal(task.getSnapshot().phase,'cancelled');
        const second=task.load(file,()=>current,apply);await flush();const stale=Transport.instances.at(-1)!;const third=task.load(file,()=>current,apply);await flush();stale.reply('旧重选');assert.equal(await second,false);assert.equal(task.getSnapshot().phase,'parsing');
        current=editDocument(current,d=>{d.basic.role='新的编辑';});Transport.instances.at(-1)!.reply('旧编辑');assert.equal(await third,false);assert.equal(applications,0);assert.match(task.getSnapshot().message,/未覆盖/);
        const broken=task.load(file,()=>current,apply);await flush();Transport.instances.at(-1)!.onerror?.();assert.equal(await broken,false);assert.equal(task.getSnapshot().phase,'failed');
        const retry=task.load(file,()=>current,apply);await flush();Transport.instances.at(-1)!.reply('正确重试');assert.equal(await retry,true);assert.equal(current.basic.name,'正确重试');assert.ok(current.uncertainties.includes('虚构部件遗漏提示'));
        const leave=task.load(file,()=>current,apply);await flush();task.dispose();Transport.instances.at(-1)!.reply('离开后旧任务');assert.equal(await leave,false);assert.equal(applications,1);
    }finally{task.dispose();restore();}
});
test('B-DEF-03: queued autosave/slow atomic apply disable cancel and reselect; leaving makes no rollback promise',async()=>{
    const restore=worker(),task=new ImportSession(),session=new DraftSession(),store=await DraftStore.open('repair-slow-'+crypto.randomUUID()),doc=emptyDocument(),gate=deferred();let calls=0;
    try{
        await store.commit(doc,null);session.attach({async commit(...args){if(++calls===1)await gate.promise;return store.commit(...args);}},doc,[],true);
        session.edit(d=>{d.basic.name='应用前编辑';});const autosave=session.save();await flush();
        const load=task.load(file,()=>session.getSnapshot().document!,async(next,base)=>session.apply(next,'import',base));await flush();Transport.instances.at(-1)!.reply('新的虚构导入');await flush();
        assert.equal(task.getSnapshot().phase,'applying');assert.match(task.getSnapshot().message,/不能取消.*离开后仍可能完成/);assert.equal(task.cancel(),false);const count=Transport.instances.length;assert.equal(await task.load(file,()=>doc,async()=>{}),false);assert.equal(Transport.instances.length,count);
        assert.equal(session.getSnapshot().busy,true);assert.match(session.getSnapshot().status,/正在应用/);session.edit(d=>{d.basic.name='MUST_NOT_EDIT_WHILE_APPLYING';});assert.equal(session.getSnapshot().document!.basic.name,'应用前编辑');
        task.dispose();gate.resolve();await autosave;assert.equal(await load,false);const saved=await store.load();assert.equal(saved.document!.basic.name,'新的虚构导入');assert.equal(saved.history.find(h=>h.source==='before-import')!.document.basic.name,'应用前编辑');assert.equal(session.getSnapshot().document!.revision,2);
    }finally{gate.resolve();task.dispose();session.dispose();store.close();restore();}
});
test('B-DEF-03: failed apply keeps facts and permits editing/retry through the actual entry',async()=>{
    const restore=worker(),task=new ImportSession(),session=new DraftSession(),store=await DraftStore.open('repair-failure-'+crypto.randomUUID()),doc=emptyDocument();let fail=true;
    try{
        await store.commit(doc,null);session.attach({async commit(...args){if(fail)throw new Error('FICTIONAL_SAVE_FAILURE');return store.commit(...args);}},doc,[],true);
        const load=()=>task.load(file,()=>session.getSnapshot().document!,async(next,base)=>session.apply(next,'import',base));
        const first=load();await flush();Transport.instances.at(-1)!.reply('失败导入');assert.equal(await first,false);assert.equal(task.getSnapshot().phase,'failed');assert.match(task.getSnapshot().message,/SAVE_FAILURE/);assert.deepEqual((await store.load()).document,doc);
        session.edit(d=>{d.basic.name='失败后继续编辑';});fail=false;const retry=load();await flush();Transport.instances.at(-1)!.reply('成功重试');assert.equal(await retry,true);assert.equal(task.getSnapshot().phase,'succeeded');assert.equal((await store.load()).history.find(h=>h.source==='before-import')!.document.basic.name,'失败后继续编辑');
    }finally{task.dispose();session.dispose();store.close();restore();}
});
test('B-DEF-02: Chinese/English long names and 24 combinations keep page/photo/footer/body bounded',()=>{
    const require=createRequire(import.meta.url),{createCanvas}=require('@napi-rs/canvas'),ctx=createCanvas(2480,3508).getContext('2d');
    for(const name of ['虚构长名称'.repeat(16),'FictionalLongUnbrokenName'.repeat(8)])for(const styleId of styles)for(const layoutId of layouts){
        const doc=emptyDocument();doc.basic.name=name;doc.basic.role='虚构测试岗位';doc.presentation.styleId=styleId;doc.presentation.layoutId=layoutId;doc.portrait.appliedAssetId=crypto.randomUUID();doc.sections[1].text=Array.from({length:70},(_,i)=>`虚构事实${i}，保持内容完整。`).join('\n\n');
        const plans=planResume(doc,ctx,{width:720,height:960});assert.ok(plans.length>1);
        for(const [i,plan] of plans.entries()){
            const text=plan.filter(d=>d.kind==='text');for(const d of text){ctx.font=fontCSS(d.size,d.weight,d.font);assert.ok(d.x>=PAGE.padding&&d.x+ctx.measureText(d.text).width<=PAGE.width-PAGE.padding+1,`${styleId}/${layoutId}/${d.text}`);assert.ok(d.y>=d.size&&d.y<=PAGE.height-26);}
            const marker=text.filter(d=>d.size===12);if(i)assert.equal(marker.map(d=>d.text).join(''),name+' · '+doc.basic.role+' · 续页');
            const photo=plan.find(d=>d.kind==='photo');if(i)assert.equal(photo,undefined,'continuation pages omit repeated photo');else {assert.ok(photo&&photo.kind==='photo');assert.ok(photo.x+photo.width<=PAGE.width-PAGE.padding);assert.ok(photo.y+photo.height<PAGE.height-55);}
            const body=text.filter(d=>d.role==='content');assert.ok(body.length>0);if(photo&&photo.kind==='photo')assert.ok(body[0].y>photo.y+photo.height);assert.ok(body.every(d=>d.y<PAGE.height-55));
        }
        const body=plans.flat().filter(d=>d.kind==='text'&&d.role==='content').map(d=>d.kind==='text'?d.text:'').join('').replace(/\s/g,'');assert.equal(body,doc.sections[1].text.replace(/\s/g,''));
    }
});
