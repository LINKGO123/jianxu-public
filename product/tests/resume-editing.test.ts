import test from 'node:test';
import assert from 'node:assert/strict';
import 'fake-indexeddb/auto';
import {createCanvas} from '@napi-rs/canvas';
import {unzipSync,strFromU8} from 'fflate';
import {SaxesParser} from 'saxes';
import {emptyDocument,editDocument,documentSchema,styles,layouts} from '../shared/schemas.js';
import {changeHighlights,highlightRuns} from '../shared/text-ranges.js';
import {planResume,paintPage,paintPhoto,paintSectionIcon,PAGE} from '../client/render/pages.js';
import {wrapHighlighted} from '../client/render/rich-text.js';
import {presentationValues,recommendedTypography} from '../client/render/presentation.js';
import {editableDocx} from '../client/render/document-files.js';
import {DraftStore} from '../client/storage.js';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {LayoutSettings} from '../client/render/LayoutSettings.js';
const ctx=()=>createCanvas(794,1123).getContext('2d');
const source='甲公司 2022—2023\n岗位：虚构产品工程师\n完成重复成果10万元。\n乙公司 2024—2025\n保留重复成果与👩🏽‍💻测试。';
function sample(){const doc=emptyDocument();doc.basic.name='虚构编辑验证';doc.basic.role='测试岗位';doc.sections[1].text=source;doc.sections[0].text='个人优势仅作虚构样本';doc.sections.find(s=>s.id==='skills')!.text='技能事实';return doc;}
test('ED06 precise repeated/grapheme/cross-line ranges merge idempotently and subtract only selection',()=>{
 const text='重复 A\n重复 👩🏽‍💻 é';let ranges=changeHighlights(text,[],5,7,true);
 assert.deepEqual(highlightRuns(text,ranges),[{text:'重复 A\n',bold:false},{text:'重复',bold:true},{text:' 👩🏽‍💻 é',bold:false}]);
 ranges=changeHighlights(text,ranges,0,6,true);assert.deepEqual(ranges,[{start:0,end:7}]);assert.deepEqual(changeHighlights(text,ranges,0,6,true),ranges);
 assert.deepEqual(changeHighlights(text,ranges,1,6,false),[{start:0,end:1},{start:6,end:7}]);
 const emoji=text.indexOf('👩');assert.throws(()=>changeHighlights(text,[],emoji,emoji+2,true),/完整/);assert.throws(()=>changeHighlights(text,[],4,5,true),/非空/);
 assert.deepEqual(changeHighlights(text,[],emoji,emoji+'👩🏽‍💻'.length,true),[{start:emoji,end:emoji+7}]);
});
test('ED06 text editing invalidates only that section, and schema rejects stale/split/overlapping ranges',()=>{
 const d=sample();d.sections[1].highlights=[{start:0,end:3}];d.sections[0].highlights=[{start:0,end:2}];d.sections[1].formatting=[{line:1,kind:'role'}];
 const e=editDocument(d,x=>{x.sections[1].text+='\n新行';});assert.equal(e.sections[1].highlights,undefined);assert.equal(e.sections[1].formatting,undefined);assert.deepEqual(e.sections[0].highlights,d.sections[0].highlights);assert.equal(e.confirmedRevision,null);
 for(const highlights of [[{start:-1,end:2}],[{start:0,end:999}],[{start:0,end:3},{start:2,end:4}]])assert.throws(()=>documentSchema.parse({...d,sections:d.sections.map((s,i)=>i===1?{...s,highlights}:s)}));
 const legacy=documentSchema.parse(emptyDocument());assert.equal(legacy.presentation.typography,undefined);assert.equal(legacy.presentation.photo,undefined);assert.equal(legacy.sections[1].highlights,undefined);
});
test('ED06 bold runs use actual weighted measurement and never split emoji or lose text',()=>{
 const text='中英文 English👩🏽‍💻成果，重复成果10万元。'.repeat(4),context=ctx(),ranges=[{start:0,end:text.length}];
 const rows=wrapHighlighted(text,ranges,0,130,15,400,'sans-serif',context);assert.equal(rows.map(r=>r.value).join(''),text);
 for(const row of rows){context.font='700 15px sans-serif';assert.ok(context.measureText(row.value).width<=130.1);assert.ok(!/^[，。]/.test(row.value));assert.ok(!/[\ud800-\udbff]$/.test(row.value));}
});
test('ED06–10 store roundtrip/history are atomic with text and presentation, stale writes rejected',async()=>{
 const store=await DraftStore.open('fictional-ed-'+crypto.randomUUID());try{
  const d=sample();await store.commit(d,null);const snap=await store.commit(d,0,'snapshot');const e=editDocument(d,x=>{x.sections[1].highlights=[{start:0,end:3}];x.presentation.typography=recommendedTypography;x.presentation.photo={visible:false,position:'sidebar',size:72,shape:'circle'};x.presentation.sidebarSections=['skills'];});
  await store.commit(e,0);assert.deepEqual((await store.load()).document,e);
  await assert.rejects(store.commit(d,0),/其他|更新|版本/);const restored=await store.commit(e,1,'restore',snap.history[0]);assert.deepEqual(restored.document.sections,d.sections);assert.equal(restored.document.presentation.typography,undefined);assert.deepEqual(restored.history.find(s=>s.source==='before-restore')?.document.sections,e.sections);
 }finally{store.close();}
});
test('ED07/08 units and independent overrides survive styles without changing source',()=>{
 const doc=sample(),original=structuredClone(doc.sections);doc.presentation.typography={...recommendedTypography,family:'serif'};doc.presentation.spacing={line:1.8,paragraph:12,module:24,margin:20,groups:{role:9}};
 assert.equal(presentationValues(doc).name,26*4/3);assert.equal(presentationValues(doc).margin,20*96/25.4);
 for(const styleId of styles){doc.presentation.styleId=styleId;const plan=planResume(doc,ctx());assert.ok(plan.flat().some(d=>d.kind==='text'&&d.size===26*4/3));assert.deepEqual(doc.sections,original);}
});
test('ED04/05/09/10 all 24 combinations preserve facts, columns, photo and measured bounds',()=>{
 const doc=sample();doc.sections[1].formatting=[{line:1,kind:'role'}];doc.sections[1].highlights=[{start:source.indexOf('10万'),end:source.indexOf('10万')+3}];doc.presentation.typography=recommendedTypography;doc.presentation.sidebarSections=['summary','skills'];doc.presentation.photo={visible:true,position:'sidebar',size:72,shape:'circle'};doc.portrait.appliedAssetId=crypto.randomUUID();doc.presentation.headings={icons:true,line:'strong'};
 for(const styleId of styles)for(const layoutId of layouts){doc.presentation.styleId=styleId;doc.presentation.layoutId=layoutId;const plan=planResume(doc,ctx(),{width:600,height:800}),texts=plan.flat().filter(d=>d.kind==='text');const body=texts.filter(d=>d.role==='content').map(d=>d.text).join('');assert.ok(body.includes('技能事实'));assert.ok(body.includes('个人优势仅作虚构样本'));assert.ok(body.replace(/\s/g,'').includes(source.replace(/\s/g,'')));
  const photo=plan.flat().find(d=>d.kind==='photo');assert.ok(photo&&photo.kind==='photo');assert.equal(photo.width,96);assert.equal(photo.shape,'circle');assert.ok(plan.flat().some(d=>d.kind==='icon'));
  for(const d of texts){const c=ctx();c.font=`${d.weight} ${d.size}px ${d.font}`;assert.ok(d.x+c.measureText(d.text).width<=PAGE.width-presentationValues(doc).margin+1,JSON.stringify(d));assert.ok(d.y<=PAGE.height-26);}
  const skill=texts.find(d=>d.text==='技能事实')!;if(layoutId==='sidebar-left')assert.equal(skill.x,60);if(layoutId==='sidebar-right')assert.equal(skill.x,574);
 }
 doc.presentation.layoutId='single';assert.equal(presentationValues(doc).photoPosition,'top-right');assert.deepEqual(doc.presentation.sidebarSections,['summary','skills']);doc.presentation.layoutId='sidebar-left';assert.equal(presentationValues(doc).photoPosition,'sidebar');
 doc.presentation.photo.visible=false;assert.equal(planResume(doc,ctx()).flat().some(d=>d.kind==='photo'),false);assert.ok(doc.portrait.appliedAssetId);
});
test('ED04 long four-layout documents retain 120 items, continuation context and final facts',()=>{
 const doc=sample();doc.sections[1].text=Array.from({length:120},(_,i)=>`项目${i+1}：虚构事项${i+1}\n保留测试事实与Englishlongword${i+1}。`).join('\n');doc.sections[0].text=Array.from({length:30},(_,i)=>`优势${i+1}。`).join('\n');doc.presentation.sidebarSections=['summary'];doc.presentation.headings={icons:true,line:'thin'};doc.presentation.typography=recommendedTypography;
 for(const layoutId of layouts){doc.presentation.layoutId=layoutId;const pages=planResume(doc,ctx()),body=pages.flat().filter(d=>d.kind==='text'&&d.role==='content').map(d=>d.kind==='text'?d.text:'').join('').replace(/\s/g,'');assert.ok(pages.length>1);for(const line of doc.sections[1].text.split('\n'))assert.ok(body.includes(line.replace(/\s/g,'')),line);assert.ok(body.includes('Englishlongword120。'));for(const page of pages)assert.ok(page.some(d=>d.kind==='text'&&d.role==='content'));}
});
test('ED09 circle uses cover crop, preserves ratio and transparent corners; square stays opaque',()=>{
 const source=createCanvas(60,100),s=source.getContext('2d');s.fillStyle='#ff0000';s.fillRect(0,0,60,100);
 for(const shape of ['circle','square'] as const){const c=createCanvas(100,100),x=c.getContext('2d');paintPhoto(x as unknown as CanvasRenderingContext2D,source as unknown as CanvasImageSource,0,0,100,100,shape);assert.equal(x.getImageData(50,50,1,1).data[3],255);assert.equal(x.getImageData(0,0,1,1).data[3],shape==='circle'?0:255);}
});
test('ED DOCX maps native text/bold/font/spacing/columns/photo/icon without remote relationships',async()=>{
 const doc=sample();doc.sections[1].highlights=[{start:source.indexOf('10万'),end:source.indexOf('10万')+3}];doc.presentation.typography={...recommendedTypography,family:'serif'};doc.presentation.spacing={line:1.8,paragraph:12,module:24,margin:20,groups:{body:6}};doc.presentation.sidebarSections=['summary','skills'];doc.presentation.photo={visible:true,position:'sidebar',size:72,shape:'circle'};doc.portrait.appliedAssetId=crypto.randomUUID();doc.confirmedRevision=doc.revision;doc.presentation.headings={icons:true,line:'strong'};
 const canvas=createCanvas(100,100),x=canvas.getContext('2d');paintSectionIcon(x as unknown as CanvasRenderingContext2D,0,0,100,'#31543e');const bytes=new Uint8Array(canvas.toBuffer('image/png')),photo={bytes,width:100,height:100};
 for(const layoutId of layouts){doc.presentation.layoutId=layoutId;const files=unzipSync(new Uint8Array(await editableDocx(doc,photo,bytes).arrayBuffer())),body=strFromU8(files['word/document.xml']),style=strFromU8(files['word/styles.xml']);
  for(const [name,data]of Object.entries(files))if(/xml$|rels$/.test(name))new SaxesParser({xmlns:true}).write(strFromU8(data)).close();
  assert.match(body,/<w:b\/>[\s\S]*?<w:t xml:space="preserve">10万<\/w:t>/);assert.match(body,/w:val="52"/);assert.match(style,/w:line="432"/);assert.match(body,/w:top="1134"/);assert.match(body,/Songti SC/);assert.ok(files['word/media/portrait.png']);assert.ok(files['word/media/module-icon.png']);assert.match(body,/w:pBdr/);assert.match(body,/个人优势仅作虚构样本/);assert.match(body,/保留重复成果与👩🏽‍💻测试。/);assert.ok(!strFromU8(files['word/_rels/document.xml.rels']).includes('TargetMode="External"'));if(layoutId!=='single')assert.match(body,/<w:tbl>/);
 }
});
test('ED08 explicit bottom margin constrains content as well as top and sides',()=>{
 const d=sample();d.presentation.spacing={margin:25};d.sections[1].text=Array.from({length:120},(_,i)=>`第${i+1}条虚构正文。`).join('\n');
 for(const page of planResume(d,ctx()))for(const draw of page)if(draw.kind==='text'&&draw.role==='content')assert.ok(draw.y<=PAGE.height-25*96/25.4);
});
test('ED06 regression: whole history restoration preserves marks with their own older text',async()=>{
 const store=await DraftStore.open('fictional-ed-restore-'+crypto.randomUUID());try{
  const marked=sample();marked.sections[1].highlights=[{start:0,end:3}];marked.sections[1].formatting=[{line:1,kind:'role'}];await store.commit(marked,null);const snapshot=await store.commit(marked,0,'snapshot');const changed=editDocument(marked,d=>{d.sections[1].text+='\n新正文';});assert.equal(changed.sections[1].highlights,undefined);await store.commit(changed,0);
  const restored=await store.commit(changed,1,'restore',snapshot.history[0]);assert.deepEqual(restored.document.sections,marked.sections);assert.equal(restored.document.revision,2);assert.equal(restored.document.confirmedRevision,null);assert.deepEqual(restored.history[0].document.sections,changed.sections);
 }finally{store.close();}
});
test('ED06 manual emphasis preserves automatic bullet prefix and both participate in wrapping',()=>{
 const d=sample(),s=d.sections[1];s.text='成果：保留金额10万元与原文。';s.highlights=[{start:7,end:10}];const draws=planResume(d,ctx()).flat().filter(x=>x.kind==='text'&&x.role==='content');assert.ok(draws.some(x=>x.kind==='text'&&x.text==='成果：'&&x.weight===600));assert.ok(draws.some(x=>x.kind==='text'&&x.weight===700));
});
test('ED10 table headings honor divider choice and closing label height',()=>{
 const d=sample();d.presentation.layoutId='table';d.presentation.typography={section:18};d.presentation.headings={icons:true,line:'strong'};const draws=planResume(d,ctx()).flat();assert.ok(draws.some(x=>x.kind==='rect'&&x.x===60&&x.width===88&&x.height===2));d.presentation.headings.line='none';assert.equal(planResume(d,ctx()).flat().some(x=>x.kind==='rect'&&x.x===60&&x.width===88&&x.height===2),false);
});
test('ED DOCX dates use auxiliary size and theme text keeps body/header font roles',async()=>{
 const d=sample();d.presentation.typography={body:11,auxiliary:9};d.confirmedRevision=d.revision;const files=unzipSync(new Uint8Array(await editableDocx(d).arrayBuffer())),body=strFromU8(files['word/document.xml']);assert.match(body,/<w:rFonts w:ascii="PingFang SC"[^]*?<w:sz w:val="18"\/><w:b w:val="0"\/><\/w:rPr><w:t xml:space="preserve">2022—2023/);assert.match(body,/w:ascii="Songti SC"/);
});

test('ED-IND-01 partial body overrides keep project/control/Word at the experience size',async()=>{
 const d=emptyDocument();d.basic.name='虚构部分字号';d.sections[1].text='项目名称：虚构项目\n岗位：虚构岗位\n普通正文。';d.sections[1].formatting=[{line:0,kind:'project'},{line:1,kind:'role'},{line:2,kind:'body'}];d.confirmedRevision=d.revision;
 assert.equal(presentationValues(d).project,15);
 for(const body of [10,11,13])for(const layoutId of layouts){
  d.presentation.layoutId=layoutId;d.presentation.typography={body};const v=presentationValues(d),draws=planResume(d,ctx()).flat();
  assert.equal(v.project,v.company);assert.equal(v.company,17);
  for(const title of ['项目名称：虚构项目','岗位：虚构岗位'])assert.ok(draws.some(x=>x.kind==='text'&&x.text===title&&x.size===v.company));
  const files=unzipSync(new Uint8Array(await editableDocx(d).arrayBuffer())),xml=strFromU8(files['word/document.xml']);
  const project=xml.match(/<w:p>(?:(?!<w:p>)[\s\S])*?项目名称：虚构项目[\s\S]*?<\/w:p>/)![0];
  assert.match(project,/<w:sz w:val="26"\/>/);
 }
 d.presentation.typography={body:10,experience:14.5};assert.equal(presentationValues(d).project,14.5*4/3);
});

test('ED-IND-01 unconfigured old drafts display both original heading sizes without rewriting them',()=>{
 const d=sample(),before=structuredClone(d);const markup=renderToStaticMarkup(createElement(LayoutSettings,{document:d,change:()=>{},disabled:false,editSection:()=>{}}));assert.match(markup,/公司 12.75 \/ 项目 11.25 pt（原默认）/);assert.deepEqual(d,before);
});

test('ED-IND-02 explicit paragraph spacing affects continuous paragraphs and native Word in all layouts',async()=>{
 for(const separator of ['\n','\r\n','\n\n'])for(const layoutId of layouts){
  const d=emptyDocument();d.basic.name='虚构段距';d.presentation.layoutId=layoutId;d.sections[1].text=['甲段正文。','乙段正文。','丙段正文。'].join(separator);d.confirmedRevision=d.revision;
  const positions=(gap:number)=>{d.presentation.spacing={paragraph:gap};return planResume(d,ctx()).flat().filter(x=>x.kind==='text'&&x.role==='content');};
  const a=positions(0),b=positions(18);assert.equal(a.length,3);assert.equal(b.length,3);
  assert.equal(b[1].y-a[1].y,24);assert.equal(b[2].y-a[2].y,48);
  const files=unzipSync(new Uint8Array(await editableDocx(d).arrayBuffer())),xml=strFromU8(files['word/document.xml']);
  for(const value of ['乙段正文。','丙段正文。']){const p=xml.match(new RegExp('<w:p>(?:(?!<w:p>)[\\s\\S])*?'+value+'[\\s\\S]*?<\\/w:p>'))![0];assert.match(p,/<w:spacing w:before="360" w:after="0"\/>/);}
  assert.equal((xml.match(/<w:t xml:space="preserve"><\/w:t>/g)??[]).length,1);
 }
});

test('ED-IND-02 group overrides replace paragraph spacing without adding it twice',async()=>{
 const d=emptyDocument();d.basic.name='虚构分组段距';d.sections[1].text='甲段正文。\n\n乙段正文。';d.presentation.spacing={paragraph:18,groups:{body:6}};d.confirmedRevision=d.revision;
 const y=()=>planResume(d,ctx()).flat().filter(x=>x.kind==='text'&&x.role==='content').map(x=>x.y);
 const a=y();d.presentation.spacing.paragraph=0;assert.deepEqual(y(),a);
 const files=unzipSync(new Uint8Array(await editableDocx(d).arrayBuffer())),xml=strFromU8(files['word/document.xml']);const p=xml.match(/<w:p>(?:(?!<w:p>)[\s\S])*?乙段正文。[\s\S]*?<\/w:p>/)![0];assert.match(p,/<w:spacing w:before="120" w:after="0"\/>/);
});
