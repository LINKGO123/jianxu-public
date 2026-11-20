import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyDocument, editDocument, documentSchema, visibleSections } from '../shared/schemas.js';
import Reading from '../shared/reading-model.js';
import Yearbook from '../shared/yearbook-model.js';
test('SIM-007/008: presets, ordering and hiding never inject or delete facts', () => {
    const original = emptyDocument();
    original.sections.find(s => s.id === 'education')!.text = '虚构测试学校';
    original.sections.find(s => s.id === 'work')!.text = '虚构工作经历';
    original.sections.find(s => s.id === 'unknown')!.text = '无法归类的原文';
    const graduate = editDocument(original, d => { d.presentation.reading = Reading.preset('graduate', d.presentation.reading); });
    assert.equal(visibleSections(graduate)[0].id, 'education');
    assert.deepEqual(graduate.sections, original.sections);
    const hidden = editDocument(graduate, d => { d.presentation.reading.hidden = ['education']; });
    assert.ok(!visibleSections(hidden).some(s => s.id === 'education'));
    assert.equal(hidden.sections.find(s => s.id === 'education')!.text, '虚构测试学校');
    assert.equal(visibleSections(hidden).at(-1)?.id, 'unknown');
    assert.deepEqual(Reading.normalize({ order: ['work', 'work', 'bogus'] }).order.slice(0, 2), ['work', 'summary']);
});
test('revision increments and all edits invalidate confirmation; no preview-only copy', () => {
    const doc = emptyDocument();
    doc.confirmedRevision = 0;
    const changed = editDocument(doc, d => { d.basic.name = '虚构甲'; });
    assert.equal(changed.revision, 1);
    assert.equal(changed.confirmedRevision, null);
    assert.equal(doc.basic.name, '');
    const styled = editDocument(changed, d => { d.presentation.styleId = 'tokyo'; });
    assert.equal(styled.revision, 2);
    assert.equal(styled.basic.name, '虚构甲');
});
test('SIM-020/029: strict persistent schema rejects unknown credentials and invalid/future data', () => {
    const doc = emptyDocument();
    assert.equal(documentSchema.safeParse({ ...doc, apiKey: 'FICTIONAL_SENTINEL' }).success, false);
    assert.equal(documentSchema.safeParse({ ...doc, schemaVersion: 2 }).success, false);
    assert.equal(documentSchema.safeParse({ ...doc, sections: [...doc.sections.slice(0, 8), doc.sections[0]] }).success, false);
});
test('SIM-017: reused yearbook model keeps identity choices and rejects over-two-line cards', () => {
    const options = Yearbook.normalize({ format: 'card', nameMode: 'custom', nameText: 'Fictional Test', mottoId: 'custom', mottoText: 'one\ntwo\nthree' });
    assert.equal(Yearbook.resolveName(options, {}), 'FICTIONAL TEST');
    assert.match(Yearbook.validate(options, {}), /最多两行/);
    assert.equal(Yearbook.normalize().presentation, 'keep');
    assert.equal(Yearbook.resolveName(Yearbook.normalize(), { name: '欧阳测试' }, () => ['ou', 'yang', 'ce', 'shi']), 'CESHI');
});
test('SIM-001/002 L1: four-step URL navigation keeps skip links independent', async () => {
    const { stepFromHash } = await import('../client/navigation.js');
    assert.deepEqual([1, 2, 3, 4].map(i => stepFromHash(`#step-${i}`)), [0, 1, 2, 3]);
    assert.equal(stepFromHash(''), 0);
    assert.equal(stepFromHash('#main-content'), null);
    assert.equal(stepFromHash('#step-5'), null);
});
