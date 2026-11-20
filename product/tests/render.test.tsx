import test from 'node:test';
import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';
import { Preview } from '../client/Preview.js';
import { emptyDocument } from '../shared/schemas.js';
test('SIM-029 L1: React renders hostile resume text as text, hidden contacts absent', () => {
    const doc = emptyDocument();
    doc.basic.name = '<img src=x onerror="test()">';
    doc.basic.phone = 'FICTIONAL_PRIVATE_PHONE';
    doc.basic.showPhone = false;
    doc.sections[0].text = '<script>test()</script>';
    const html = renderToStaticMarkup(<Preview document={doc}/>);
    assert.ok(html.includes('&lt;script&gt;'));
    assert.ok(!html.includes('<script>'));
    assert.ok(!html.includes('<img src=x'));
    assert.ok(!html.includes('FICTIONAL_PRIVATE_PHONE'));
});
