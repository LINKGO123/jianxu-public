import test from 'node:test';
import assert from 'node:assert/strict';
import {buildDraft,checkExtracted} from '../client/import/core.js';
import {documentSchema,emptyDocument,styles,layouts} from '../shared/schemas.js';
import {planResume,PAGE} from '../client/render/pages.js';
import {createCanvas} from '@napi-rs/canvas';

test('plain Chinese header prefill and section aliases preserve source facts without guessing a target job',()=>{
 const lines=['林安然','本科（全日制）-毕业于2020.6','13800000000','fictional@example.com','个人优势：','具有课程开发经验。','关键项目成果：','完成12次虚构项目。','资格证书：','虚构证书','工作经历：','虚构公司 2021—2025 培训主管'];
 const extracted=checkExtracted(lines.map((text,i)=>({text,ref:`page:1:line:${i+1}`}))),doc=buildDraft(extracted,emptyDocument());
 assert.equal(doc.basic.name,'林安然');assert.equal(doc.basic.phone,'13800000000');assert.equal(doc.basic.email,'fictional@example.com');assert.equal(doc.basic.role,'');
 assert.equal(doc.sections.find(s=>s.id==='education')!.text,lines[1]);assert.equal(doc.sections.find(s=>s.id==='project')!.text,lines[7]);assert.equal(doc.sections.find(s=>s.id==='certificates')!.text,lines[9]);assert.equal(doc.sections.find(s=>s.id==='unknown')!.text,'');assert.equal(doc.sourceText,extracted.text);
 const unknown=buildDraft(checkExtracted(['培训主管','任职13900000000人次','工作经历','联系13800000000名学员'].map((text,i)=>({text,ref:`page:1:line:${i}`}))),emptyDocument());
 assert.equal(unknown.basic.name,'');assert.equal(unknown.basic.phone,'');assert.ok(unknown.sections.find(s=>s.id==='unknown')!.text.includes('培训主管'));
});

test('compact pagination is opt-in, reads old drafts, keeps every fact and stays inside A4',()=>{
 const doc=emptyDocument(),old=structuredClone(doc);delete (old.presentation as Partial<typeof old.presentation>).density;
 assert.equal(documentSchema.parse(old).presentation.density,'comfortable');
 const ctx=createCanvas(PAGE.outputWidth,PAGE.outputHeight).getContext('2d');
 doc.basic.name='虚构分页测试';doc.basic.role='测试岗位';doc.sections.find(s=>s.id==='work')!.text=Array.from({length:60},(_,i)=>`第${i+1}项虚构工作：保留事实和数字，不删除文字。`).join('\n');
 for(const styleId of styles)for(const layoutId of layouts){
  doc.presentation.styleId=styleId;doc.presentation.layoutId=layoutId;doc.presentation.density='comfortable';const normal=planResume(doc,ctx);
  doc.presentation.density='compact';const compact=planResume(doc,ctx),body=compact.flat().filter(d=>d.kind==='text').filter(d=>d.role==='content');
  assert.ok(compact.length<=normal.length);assert.equal(body.map(d=>d.text).join(''),doc.sections.find(s=>s.id==='work')!.text.replace(/\n/g,''));
  for(const d of compact.flat())if(d.kind==='text'){ctx.font=`${d.weight} ${d.size}px ${d.font}`;assert.ok(d.x+ctx.measureText(d.text).width<=PAGE.width-PAGE.padding+1);assert.ok(d.y<=PAGE.height-26);}
 }
});
