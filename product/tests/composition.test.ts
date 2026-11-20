import test from 'node:test';
import assert from 'node:assert/strict';
import {createCanvas} from '@napi-rs/canvas';
import {unzipSync,strFromU8} from 'fflate';
import {emptyDocument,editDocument,layouts,sectionIds} from '../shared/schemas.js';
import {lineJoinOptions,bulletMarker} from '../client/render/structure.js';
import {planResume,paintPhoto,paintSectionIcon} from '../client/render/pages.js';
import {editableDocx} from '../client/render/document-files.js';
const context=()=>createCanvas(794,1123).getContext('2d');
test('CP01 offers only adjacent body continuation, preserves source and existing revision protection',()=>{
 const d=emptyDocument(),s=d.sections[1];s.text='职责：完成背\n景资料核对\n\n1. 新条目\nEnglish\nwords\n虚构科技公司 2022—2024\n岗位：工程师';s.highlights=[{start:0,end:2}];d.sourceText=s.text;d.confirmedRevision=d.revision;
 const options=lineJoinOptions(s);assert.equal(options[0].after,'职责：完成背景资料核对');assert.ok(options.some(x=>x.after==='English words'));assert.ok(!options.some(x=>x.before.includes('2022')));assert.ok(!options.some(x=>x.before.includes('\n\n')));
 assert.deepEqual(lineJoinOptions({...s,text:'岗位：工程师\n独立职责。\n另一项职责\n2023—2024\n(1) 编号条目'}),[]);
 const next=editDocument(d,x=>{x.sections[1].text=options[0].after+'\n'+s.text.split('\n').slice(2).join('\n');});assert.equal(next.sourceText,d.sourceText);assert.equal(next.sections[1].highlights,undefined);assert.equal(next.confirmedRevision,null);assert.equal(next.revision,d.revision+1);
});
test('CP02 bullets render once with hanging continuation and regular description in four layouts',()=>{
 for(const layoutId of layouts){const d=emptyDocument();d.presentation.layoutId=layoutId;d.sections[1].text='1. 成果：'+ '虚构连续说明内容。'.repeat(25);const plan=planResume(d,context()).flat(),content=plan.filter(x=>x.kind==='text').filter(x=>x.role==='content');assert.equal(content.map(x=>x.text).join(''),d.sections[1].text);const marker=content.find(x=>x.text==='1. ');assert.ok(marker);const body=content.filter(x=>x!==marker);assert.ok(body.some(x=>x.weight===400));assert.ok(body.some(x=>x.weight===600));assert.ok(body.every(x=>x.x>marker.x));assert.equal(bulletMarker('普通正文'), '');}
});
test('CP02 highlighted marker is measured and retained',()=>{const d=emptyDocument();d.sections[1].text='1. 成果：说明';d.sections[1].highlights=[{start:0,end:3}];const text=planResume(d,context()).flat().filter(x=>x.kind==='text');assert.equal(text.find(x=>x.text==='1. ')?.weight,700);});
test('CP03 complete card preserves colored edges; portrait shape is 3:4 in plan',()=>{
 const source=createCanvas(90,120),s=source.getContext('2d');s.fillStyle='red';s.fillRect(0,0,90,120);s.fillStyle='blue';s.fillRect(10,10,70,100);const target=createCanvas(120,120),t=target.getContext('2d');paintPhoto(t as never,source as never,0,0,120,120,'contain');assert.deepEqual([...t.getImageData(15,0,1,1).data],[255,0,0,255]);assert.deepEqual([...t.getImageData(60,119,1,1).data],[255,0,0,255]);
 const d=emptyDocument();d.portrait.appliedAssetId=crypto.randomUUID();d.presentation.photo={visible:true,position:'top-right',shape:'portrait',size:72};let p=planResume(d,context(),{width:90,height:120}).flat().find(x=>x.kind==='photo')!;assert.equal(p.width/p.height,.75);p=planResume(d,context(),{width:90,height:120,kind:'card'}).flat().find(x=>x.kind==='photo')!;assert.equal(p.shape,'contain');assert.equal(p.width/p.height,.75);
});
test('CP04 semantic icons differ and Word references section-specific assets plus list indentation',async()=>{
 const icons:Record<string,Uint8Array>={};for(const id of sectionIds){const c=createCanvas(48,48);paintSectionIcon(c.getContext('2d') as never,0,0,48,'#31543e',id);icons[id]=c.toBuffer('image/png');}assert.notDeepEqual(icons.work,icons.education);assert.notDeepEqual(icons.skills,icons.project);
 const d=emptyDocument();d.basic.name='虚构';d.sections[1].text='1. 成果：普通说明\nEnglish: plain';d.presentation.headings={icons:true,line:'thin'};d.confirmedRevision=d.revision;const zip=unzipSync(new Uint8Array(await editableDocx(d,undefined,icons).arrayBuffer())),xml=strFromU8(zip['word/document.xml']);assert.match(xml,/moduleIcon-work/);assert.match(xml,/w:hanging/);assert.match(xml,/<w:t xml:space="preserve">1. 成果：<\/w:t>/);assert.match(xml,/<w:t xml:space="preserve">普通说明<\/w:t>/);assert.doesNotMatch(xml.split('<w:p>').find(p=>p.includes('English: plain'))!,/<w:b\/>/);assert.ok(zip['word/media/module-icon-work.png']);assert.match(strFromU8(zip['word/_rels/document.xml.rels']),/Id="moduleIcon-work"[^>]*Target="media\/module-icon-work.png"/);
});
