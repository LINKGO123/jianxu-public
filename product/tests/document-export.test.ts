import test from 'node:test';
import assert from 'node:assert/strict';
import {unzipSync,strFromU8} from 'fflate';
import {SaxesParser} from 'saxes';
import {emptyDocument,editDocument} from '../shared/schemas.js';
import {editableDocx,imagePdf} from '../client/render/document-files.js';

test('editable DOCX retains ordered visible facts, escapes XML, respects contacts and confirmation across layouts',async()=>{
    let doc=editDocument(emptyDocument(),d=>{d.basic.name='虚构文档测试';d.basic.role='培训 & 研发';d.basic.phone='HIDDEN_PHONE';d.basic.showPhone=false;d.basic.email='fictional@example.com';d.sections.find(s=>s.id==='work')!.text='甲公司 2022—2024\n  成果 <42> & 保留缩进\n\n乙公司';d.sections.find(s=>s.id==='project')!.text='不可展示项目';d.presentation.reading.hidden=['project'];});
    assert.throws(()=>editableDocx(doc),/确认/);doc={...doc,confirmedRevision:doc.revision};
    for(const layout of ['single','sidebar-left','sidebar-right','table'] as const){
        const files=unzipSync(new Uint8Array(await editableDocx({...doc,presentation:{...doc.presentation,layoutId:layout}}).arrayBuffer()));
        for(const [name,bytes] of Object.entries(files))if(name.endsWith('.xml')||name.endsWith('.rels')){const parser=new SaxesParser({xmlns:true});parser.write(strFromU8(bytes)).close();}
        const text=strFromU8(files['word/document.xml']);assert.match(text,/甲公司 2022—2024/);assert.match(text,/  成果 &lt;42&gt; &amp; 保留缩进/);assert.ok(text.indexOf('甲公司')<text.indexOf('乙公司'));assert.ok(!text.includes('不可展示项目'));assert.ok(!text.includes('HIDDEN_PHONE'));assert.match(text,/fictional@example.com/);assert.ok(!text.includes('<w:drawing>'),'not a screenshot-only document');
    }
    assert.throws(()=>editableDocx({...doc,portrait:{...doc.portrait,appliedAssetId:crypto.randomUUID()}}),/照片资产/);
});
test('PDF byte offsets and stream lengths include actual binary bytes',async()=>{
    const jpg=new Uint8Array([255,216,128,0,255,217]);const bytes=new Uint8Array(await imagePdf([jpg,jpg]).arrayBuffer());const text=new TextDecoder('latin1').decode(bytes);assert.match(text,/\/Count 2/);assert.match(text,/595\.276 841\.890/);
    const xref=Number(text.match(/startxref\n(\d+)/)![1]);assert.equal(new TextDecoder().decode(bytes.slice(xref,xref+4)),'xref');
    const entries=text.slice(xref).split('\n').slice(3,11);entries.forEach((entry,i)=>{const offset=Number(entry.slice(0,10));assert.ok(new TextDecoder().decode(bytes.slice(offset,offset+12)).startsWith(`${i+1} 0 obj`));});assert.match(text,/\/Length 6/);
});
