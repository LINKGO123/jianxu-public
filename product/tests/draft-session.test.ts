import test from 'node:test';
import assert from 'node:assert/strict';
import 'fake-indexeddb/auto';
import { DraftSession } from '../client/draft-session.js';
import { DraftStore } from '../client/storage.js';
import { emptyDocument, type ResumeDocument, type Snapshot } from '../shared/schemas.js';
type Result = {document: ResumeDocument; history: Snapshot[]};
function deferred<T>() {
    let resolve!: (value:T) => void, reject!: (reason:Error) => void;
    const promise = new Promise<T>((res,rej) => {resolve=res;reject=rej;});
    return {promise,resolve,reject};
}
async function flush() { for(let i=0;i<12;i++) await Promise.resolve(); }
function controlled() {
    const requests: {doc:ResumeDocument;expected:number|null;action:string;reply:ReturnType<typeof deferred<Result>>}[]=[];
    const session=new DraftSession(), doc=emptyDocument();
    session.attach({commit(current,expected,action='draft') {const reply=deferred<Result>();requests.push({doc:current,expected,action,reply});return reply.promise;}},doc,[],true);
    return {session,requests};
}
test('A-VERIFY-01: real debounce and late success cannot mark a newer edit saved', async t => {
    t.mock.timers.enable({apis:['setTimeout']});
    const {session,requests}=controlled();
    try {
        session.edit(d=>{d.basic.name='FICTIONAL_A';});t.mock.timers.tick(349);await flush();assert.equal(requests.length,0);
        t.mock.timers.tick(1);await flush();assert.equal(requests[0].doc.revision,1);
        session.edit(d=>{d.basic.name='FICTIONAL_B';});
        requests[0].reply.resolve({document:requests[0].doc,history:[]});await flush();
        assert.equal(session.getSnapshot().document?.basic.name,'FICTIONAL_B');assert.match(session.getSnapshot().status,/尚未保存/);assert.equal(session.unsaved,true);
        t.mock.timers.tick(350);await flush();assert.equal(requests[1].expected,1);assert.equal(requests[1].doc.revision,2);
        requests[1].reply.resolve({document:requests[1].doc,history:[]});await flush();assert.equal(session.getSnapshot().status,'已保存到当前浏览器');assert.equal(session.unsaved,false);
    } finally {session.dispose();}
});
test('A-VERIFY-01: quota failure preserves current content; retry captures latest version and permits editing', async t=>{
    t.mock.timers.enable({apis:['setTimeout']});const {session,requests}=controlled();
    try {
        session.edit(d=>{d.basic.name='FICTIONAL_A';});t.mock.timers.tick(350);await flush();
        requests[0].reply.reject(new Error('FICTIONAL_QUOTA'));await flush();assert.match(session.getSnapshot().status,/保存失败/);assert.equal(session.getSnapshot().error,'FICTIONAL_QUOTA');assert.equal(session.getSnapshot().document?.basic.name,'FICTIONAL_A');
        session.edit(d=>{d.basic.name='FICTIONAL_RETRY';});const retry=session.save();await flush();assert.equal(requests[1].doc.revision,2);assert.equal(requests[1].expected,0);
        session.edit(d=>{d.basic.name='FICTIONAL_CONTINUED';});requests[1].reply.reject(new Error('FICTIONAL_OLD_RETRY_FAILURE'));await retry;
        assert.equal(session.getSnapshot().document?.revision,3);assert.equal(session.getSnapshot().error,'');assert.match(session.getSnapshot().status,/尚未保存/);
        t.mock.timers.tick(350);await flush();requests[2].reply.resolve({document:requests[2].doc,history:[]});await flush();
        assert.equal(session.getSnapshot().document?.basic.name,'FICTIONAL_CONTINUED');assert.equal(session.getSnapshot().status,'已保存到当前浏览器');
    }finally{session.dispose();}
});
test('A-VERIFY-01: queued newer success survives stale failure without a false failure notification',async t=>{
    t.mock.timers.enable({apis:['setTimeout']});const {session,requests}=controlled();const notifications:string[]=[];
    const unsubscribe=session.subscribe(()=>notifications.push(`${session.getSnapshot().status}|${session.getSnapshot().error}`));
    try {
        session.edit(d=>{d.basic.name='FICTIONAL_OLD';});t.mock.timers.tick(350);await flush();
        session.edit(d=>{d.basic.name='FICTIONAL_NEW';});t.mock.timers.tick(350);await flush();assert.equal(requests.length,1,'writes stay serialized');
        requests[0].reply.reject(new Error('STALE_FAILURE_MUST_NOT_DISPLAY'));await flush();assert.equal(requests.length,2);assert.equal(requests[1].expected,0);
        requests[1].reply.resolve({document:requests[1].doc,history:[]});await flush();await flush();
        assert.equal(session.getSnapshot().status,'已保存到当前浏览器');assert.equal(session.getSnapshot().error,'');assert.ok(notifications.every(n=>!n.includes('STALE_FAILURE_MUST_NOT_DISPLAY')));
    }finally{unsubscribe();session.dispose();}
});
test('A-VERIFY-01: pending autosave, snapshot and restore share actual IDB revision and atomic backup',async t=>{
    t.mock.timers.enable({apis:['setTimeout']});const store=await DraftStore.open(`fictional-session-${crypto.randomUUID()}`),doc=emptyDocument();
    await store.commit(doc,null);const gate=deferred<void>(),calls:{revision:number;expected:number|null;action:string}[]=[];
    const session=new DraftSession();
    session.attach({async commit(current,expected,action='draft',target){calls.push({revision:current.revision,expected,action});if(calls.length===1)await gate.promise;return store.commit(current,expected,action,target);}},doc,[],true);
    try {
        session.edit(d=>{d.basic.name='FICTIONAL_AUTO';});t.mock.timers.tick(350);await flush();
        session.edit(d=>{d.basic.name='FICTIONAL_SNAPSHOT';});const snapshot=session.save('snapshot');assert.equal(session.getSnapshot().busy,true);
        session.edit(d=>{d.basic.name='MUST_NOT_EDIT_DURING_SNAPSHOT';});assert.equal(session.getSnapshot().document?.basic.name,'FICTIONAL_SNAPSHOT');
        gate.resolve();await snapshot;assert.deepEqual(calls.map(c=>[c.revision,c.expected,c.action]),[[1,0,'draft'],[2,1,'snapshot']]);
        const target=session.getSnapshot().history[0];session.edit(d=>{d.basic.name='FICTIONAL_CURRENT';});
        await session.save('restore',target);t.mock.timers.tick(350);await flush();
        const current=session.getSnapshot();assert.equal(current.document?.revision,4);assert.equal(current.document?.basic.name,'FICTIONAL_SNAPSHOT');assert.match(current.status,/已恢复/);assert.equal(current.busy,false);
        assert.equal(current.history[0].document.basic.name,'FICTIONAL_CURRENT');assert.deepEqual((await store.load()).document,current.document);assert.equal(calls.length,3,'restore cancels pending auto timer');
    }finally{session.dispose();store.close();}
});
test('A-VERIFY-01: failed restore keeps current revision, exits busy state and can edit/save again',async()=>{
    const {session,requests}=controlled();
    try {
        session.edit(d=>{d.basic.name='FICTIONAL_CURRENT';});const restore=session.save('restore');await flush();requests[0].reply.reject(new Error('FICTIONAL_BACKUP_FAILED'));await restore;
        assert.equal(session.getSnapshot().document?.revision,1);assert.equal(session.getSnapshot().document?.basic.name,'FICTIONAL_CURRENT');assert.equal(session.getSnapshot().busy,false);
        session.edit(d=>{d.basic.name='FICTIONAL_AFTER_FAILURE';});const retry=session.save();await flush();assert.equal(requests[1].doc.revision,2);assert.equal(requests[1].action,'draft');
        requests[1].reply.resolve({document:requests[1].doc,history:[]});await retry;assert.equal(session.getSnapshot().status,'已保存到当前浏览器');
    }finally{session.dispose();}
});
