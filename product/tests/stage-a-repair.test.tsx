import test from 'node:test';
import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';
import { emptyDocument, editDocument, styles, layouts } from '../shared/schemas.js';
import { Preview } from '../client/Preview.js';
import { SampleDialog } from '../client/App.js';
import { ReadingEditor, reorderReading } from '../client/ReadingEditor.js';
import { StyleGallery, styleDescriptions } from '../client/StyleGallery.js';
test('A-DEF-01: primary marker changes already-first education in all 24 combinations without changing facts',()=>{
    for(const style of styles)for(const layout of layouts){
        const doc=emptyDocument();doc.presentation.styleId=style;doc.presentation.layoutId=layout;
        doc.sections.find(s=>s.id==='education')!.text='FICTIONAL_EDUCATION';doc.sections.find(s=>s.id==='work')!.text='FICTIONAL_WORK';
        doc.presentation.reading.order=['education',...doc.presentation.reading.order.filter(id=>id!=='education')];
        const selected=editDocument(doc,d=>{d.presentation.reading.emphasis='education';});
        const before=renderToStaticMarkup(<Preview document={doc}/>),after=renderToStaticMarkup(<Preview document={selected}/>);
        assert.notEqual(before,after);assert.match(after,/data-section-id="education" class="reading-primary"/);assert.deepEqual(selected.sections,doc.sections);
        const hidden=editDocument(selected,d=>{d.presentation.reading.hidden=['education'];});const html=renderToStaticMarkup(<Preview document={hidden}/>);
        assert.ok(!html.includes('FICTIONAL_EDUCATION'));assert.ok(html.includes('FICTIONAL_WORK'));assert.equal(hidden.sections.find(s=>s.id==='education')!.text,'FICTIONAL_EDUCATION');
    }
});
test('A-DEF-02: actual sample dialog SSR has a heading reference, close control and descriptive image',()=>{
    const html=renderToStaticMarkup(<SampleDialog styleId="nordic" trigger={null} close={()=>{}}/>);
    assert.match(html,/<dialog[^>]*aria-labelledby="sample-dialog-title"/);assert.match(html,/<h2 id="sample-dialog-title">北欧极简/);assert.match(html,/aria-label="关闭示例"/);assert.match(html,/alt="完整简历风格参考"/);
});
test('ED02 replaces prototype fan: six static choices, selected text, descriptions and sample entry',()=>{
 const html=renderToStaticMarkup(<StyleGallery selected="tokyo" select={()=>{}} openSample={()=>{}} disabled={false}/>);
 assert.equal((html.match(/aria-pressed=/g)??[]).length,6);assert.match(html,/东京现代主义 · 已选/);assert.ok(html.includes(styleDescriptions[5]));assert.match(html,/查看高清示例/);assert.doesNotMatch(html,/切换为网格|切换为扇形|transform:/);
});
test('A-GAP-03: shared reorder validates source/target and keeps hidden facts; path and hidden hints use live data',()=>{
    const doc=emptyDocument();doc.sections.find(s=>s.id==='education')!.text='FICTIONAL_EDUCATION';doc.sections.find(s=>s.id==='work')!.text='FICTIONAL_HIDDEN';doc.presentation.reading.hidden=['work'];doc.presentation.reading.emphasis='education';
    const changed=editDocument(doc,d=>{d.presentation.reading=reorderReading(d.presentation.reading,'education','summary');});
    assert.equal(changed.presentation.reading.order[0],'education');assert.equal(changed.presentation.reading.profile,'custom');assert.deepEqual(changed.sections,doc.sections);assert.deepEqual(changed.presentation.reading.hidden,['work']);
    assert.deepEqual(reorderReading(changed.presentation.reading,'malicious','work'),changed.presentation.reading);assert.deepEqual(reorderReading(changed.presentation.reading,'work','malicious'),changed.presentation.reading);
    const html=renderToStaticMarkup(<ReadingEditor document={changed} change={()=>{}} disabled={false}/>);
    assert.ok(html.includes('面试官的阅读路径'));assert.ok(html.includes('已隐藏：工作经历'));assert.ok(html.includes('标题和段落空间'));assert.ok(html.includes('draggable="true"'));assert.ok(html.includes('上移教育背景'));assert.ok(html.includes('下移教育背景'));
});

