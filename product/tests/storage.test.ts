import test from 'node:test';
import assert from 'node:assert/strict';
import 'fake-indexeddb/auto';
import { DraftStore } from '../client/storage.js';
import { emptyDocument, editDocument } from '../shared/schemas.js';
async function open() { return DraftStore.open(`fictional-${crypto.randomUUID()}`); }
test('SIM-009 L1: real storage adapter persists edits and reopens the same database', async () => {
    const name = `fictional-${crypto.randomUUID()}`, store = await DraftStore.open(name), doc = emptyDocument();
    const edited = editDocument(doc, d => { d.basic.name = '虚构测试甲'; d.sections[0].text = '<script>test-only</script>'; });
    await store.commit(edited, null);
    store.close();
    const reopened = await DraftStore.open(name);
    assert.deepEqual((await reopened.load()).document, edited);
    reopened.close();
});
test('SIM-021: failed write rolls back both current draft and history, retry succeeds', async () => {
    const store = await open(), doc = emptyDocument();
    await store.commit(doc, null);
    const changed = editDocument(doc, d => { d.basic.name = '虚构未保存值'; });
    const put = IDBObjectStore.prototype.put;
    let calls = 0;
    IDBObjectStore.prototype.put = function (...args: Parameters<typeof put>) { if (++calls === 2)
        throw new DOMException('test quota', 'QuotaExceededError'); return put.apply(this, args); };
    try {
        await assert.rejects(store.commit(changed, 0, 'snapshot'), /保留/);
    }
    finally {
        IDBObjectStore.prototype.put = put;
    }
    assert.deepEqual((await store.load()).document, doc);
    assert.equal((await store.load()).history.length, 0);
    assert.equal(changed.basic.name, '虚构未保存值');
    await store.commit(changed, 0);
    assert.equal((await store.load()).document?.revision, 1);
    store.close();
});
test('SIM-021: restore backs up current contents atomically and failure never replaces current', async () => {
    const store = await open(), doc = emptyDocument();
    const first = await store.commit(doc, null, 'snapshot');
    const changed = editDocument(doc, d => { d.basic.name = '虚构当前值'; });
    await store.commit(changed, 0);
    const put = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function () { throw new DOMException('test failure', 'QuotaExceededError'); };
    try {
        await assert.rejects(store.commit(changed, 1, 'restore', first.history[0]));
    }
    finally {
        IDBObjectStore.prototype.put = put;
    }
    assert.equal((await store.load()).document?.basic.name, '虚构当前值');
    const restored = await store.commit(changed, 1, 'restore', first.history[0]);
    assert.equal(restored.document.basic.name, '');
    assert.equal(restored.document.revision, 2);
    assert.equal(restored.history[0].document.basic.name, '虚构当前值');
    assert.equal(restored.history[0].source, 'before-restore');
    store.close();
});
test('multi-tab stale saves are rejected instead of overwriting committed data', async () => {
    const store = await open(), doc = emptyDocument();
    await store.commit(doc, null);
    const changed = editDocument(doc, d => { d.basic.name = '虚构最新值'; });
    await store.commit(changed, 0);
    await assert.rejects(store.commit(editDocument(doc, d => { d.basic.name = '虚构旧值'; }), 0), /另一页面/);
    assert.equal((await store.load()).document?.basic.name, '虚构最新值');
    await assert.rejects(store.commit(doc, 1), /另一页面/);
    store.close();
});
test('SIM-022 L1: cap 40 and restore oldest retained snapshot without losing backup', async () => {
    const store = await open();
    let doc = emptyDocument(), revision: number | null = null;
    for (let i = 0; i < 42; i++) {
        const result = await store.commit(doc, revision, 'snapshot');
        revision = result.document.revision;
        doc = editDocument(doc, d => { d.basic.name = `虚构 ${i}`; });
    }
    const history = (await store.load()).history;
    assert.equal(history.length, 40);
    const restored = await store.commit(doc, revision, 'restore', history[39]);
    assert.equal(restored.history.length, 40);
    assert.equal(restored.document.basic.name, history[39].document.basic.name);
    assert.equal(restored.history[0].document.basic.name, doc.basic.name);
    store.close();
});
test('future schema blocks loading and preserves raw data', async () => {
    const name = `fictional-${crypto.randomUUID()}`;
    const store = await DraftStore.open(name);
    const raw = await new Promise<IDBDatabase>((resolve, reject) => { const r = indexedDB.open(name); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });
    await new Promise<void>((resolve, reject) => { const tx = raw.transaction('state', 'readwrite'); tx.objectStore('state').put({ ...emptyDocument(), schemaVersion: 2 }, 'draft'); tx.oncomplete = () => resolve(); tx.onabort = () => reject(tx.error); });
    await assert.rejects(store.load(), /不兼容/);
    raw.close();
    store.close();
});
