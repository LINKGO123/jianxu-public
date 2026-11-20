import test from 'node:test';
import assert from 'node:assert/strict';
import {renderToStaticMarkup} from 'react-dom/server';
import {PreviewSession} from '../client/render/preview-session.js';
import {PagedPreview} from '../client/render/PagedPreview.js';
import {navigateState,type Navigation} from '../client/navigation.js';
import {WorkbenchHeader} from '../client/App.js';
import {ReadingEditor} from '../client/ReadingEditor.js';
import {TextPanel} from '../client/text-ai/TextPanel.js';
import {DraftSession} from '../client/draft-session.js';
import {LocalTextApi} from '../client/text-ai/api.js';
import {emptyDocument,editDocument} from '../shared/schemas.js';
const flush=()=>new Promise<void>(resolve=>setImmediate(resolve));
test('TASTE-01: production preview keeps displayed pages during debounce/render/failure, atomically replaces, and releases only after presentation',async t=>{
    t.mock.timers.enable({apis:['setTimeout']});const revoked:string[]=[];let id=0;
    t.mock.method(URL,'createObjectURL',()=>`blob:fictional-${++id}`);t.mock.method(URL,'revokeObjectURL',(url:string)=>revoked.push(url));
    const jobs:{signal:AbortSignal;resolve:(value:{blobs:Blob[];plans:[];revision:number})=>void;reject:(error:Error)=>void}[]=[];
    const session=new PreviewSession(async(_doc,_assets,signal)=>new Promise((resolve,reject)=>jobs.push({signal,resolve,reject})));t.after(()=>session.dispose());
    const doc=emptyDocument(),assets={};session.update(doc,assets);assert.deepEqual(session.getSnapshot().urls,[]);t.mock.timers.tick(180);
    jobs[0].resolve({blobs:[new Blob(['one']),new Blob(['two'])],plans:[],revision:0});await flush();const initial=session.getSnapshot().urls;assert.equal(initial.length,2);session.presented(initial);
    const newer=editDocument(doc,d=>{d.sections[0].text='虚构新编辑';});session.update(newer,assets);assert.equal(session.getSnapshot().pending,true);assert.equal(session.getSnapshot().urls,initial);assert.deepEqual(revoked,[]);
    t.mock.timers.tick(180);jobs[1].reject(new Error('FICTIONAL_CANVAS_FAILURE'));await flush();assert.equal(session.getSnapshot().pending,false);assert.match(session.getSnapshot().error,/CANVAS_FAILURE/);assert.equal(session.getSnapshot().urls,initial);assert.deepEqual(revoked,[]);
    session.update(newer,assets);assert.equal(session.getSnapshot().error,'');t.mock.timers.tick(180);jobs[2].resolve({blobs:[new Blob(['new'])],plans:[],revision:1});await flush();const next=session.getSnapshot().urls;assert.equal(next.length,1);assert.deepEqual(revoked,[],'old pages still mounted until React commit');
    session.presented(initial);assert.deepEqual(revoked,[],'late old commit must not revoke next ready pages');session.presented(next);assert.deepEqual(revoked,initial);session.dispose();assert.deepEqual(revoked,[...initial,...next]);
});
test('TASTE-01: rapid edits cancel debounce and ignore late success/failure; leaving releases URLs and suppresses pending results',async t=>{
    t.mock.timers.enable({apis:['setTimeout']});let creates=0;const revoked:string[]=[];
    t.mock.method(URL,'createObjectURL',()=>`blob:late-${++creates}`);t.mock.method(URL,'revokeObjectURL',(url:string)=>revoked.push(url));
    const jobs:{signal:AbortSignal;resolve:(value:{blobs:Blob[];plans:[];revision:number})=>void;reject:(error:Error)=>void}[]=[];
    const session=new PreviewSession(async(_doc,_assets,signal)=>new Promise((resolve,reject)=>jobs.push({signal,resolve,reject})));const doc=emptyDocument();
    session.update(doc,{});t.mock.timers.tick(100);session.update(editDocument(doc,d=>{d.presentation.reading.emphasis='work';}),{});t.mock.timers.tick(179);assert.equal(jobs.length,0);t.mock.timers.tick(1);assert.equal(jobs.length,1);
    session.update(editDocument(doc,d=>{d.portrait.appliedAssetId=crypto.randomUUID();}),{});assert.equal(jobs[0].signal.aborted,true);t.mock.timers.tick(180);jobs[1].resolve({blobs:[new Blob(['newer'])],plans:[],revision:1});await flush();const current=session.getSnapshot();session.presented(current.urls);
    jobs[0].resolve({blobs:[new Blob(['late'])],plans:[],revision:1});await flush();assert.equal(session.getSnapshot(),current);assert.equal(creates,1);
    session.update(doc,{});t.mock.timers.tick(180);session.update(doc,{});t.mock.timers.tick(180);jobs[2].reject(new Error('FICTIONAL_OLD_ERROR'));await flush();assert.equal(session.getSnapshot().error,'');session.dispose();jobs[3].resolve({blobs:[new Blob(['after leave'])],plans:[],revision:0});await flush();assert.equal(creates,1);assert.deepEqual(revoked,current.urls);
});
test('TASTE-01: actual PagedPreview initial output reserves a paper surface and exposes update state',()=>{
    const html=renderToStaticMarkup(<PagedPreview document={emptyDocument()} assets={{}}/>);assert.match(html,/aria-busy="true"/);assert.match(html,/class="preview-placeholder"/);assert.match(html,/正在更新/);
});
test('TASTE-02: real navigation transitions preserve step, style entry and hash synchronization; actual header visual and aria selection agree',()=>{
    let state:Navigation={panel:'workspace',step:2};
    state=navigateState(state,{type:'step',step:2,styles:true});assert.deepEqual(state,{panel:'styles',step:2});assert.equal(navigateState(state,{type:'hash',hash:'#step-3'}),state);
    for(const panel of ['history','settings','guide'] as const){const away=navigateState(state,{type:'panel',panel});assert.equal(away.step,2);const html=renderToStaticMarkup(<WorkbenchHeader navigation={away} name="虚构" status="已保存" historyCount={3} onStep={()=>{}} onPanel={()=>{}}/>);assert.ok(!html.includes('step-link active'));assert.ok(!html.includes('aria-current="step"'));assert.match(html,new RegExp(`aria-current="page"[^>]*>${({history:'历史记录',settings:'AI 助手设置',guide:'使用流程'})[panel]}`));state=navigateState(away,{type:'panel',panel:'workspace'});assert.equal(state.step,2);state=navigateState(state,{type:'step',step:2,styles:true});}
    const styleHtml=renderToStaticMarkup(<WorkbenchHeader navigation={state} name="虚构" status="已保存" historyCount={0} onStep={()=>{}} onPanel={()=>{}}/>);assert.match(styleHtml,/aria-current="page"[^>]*>排版与风格/);assert.match(styleHtml,/class="step-link active" aria-current="step"/);
    state=navigateState(state,{type:'step',step:2});state=navigateState(state,{type:'panel',panel:'settings'});state=navigateState(state,{type:'panel',panel:'workspace'});assert.deepEqual(state,{step:2,panel:'workspace'});assert.deepEqual(navigateState(state,{type:'hash',hash:'#step-4'}),{step:3,panel:'workspace'});assert.equal(navigateState(state,{type:'hash',hash:'#unknown'}),state);
});
test('TASTE-03: actual compact reading and AI panels keep disclosures closed, data and authorization visible, and configure guidance truthful',()=>{
    const doc=emptyDocument();doc.sections.find(s=>s.id==='work')!.text='虚构工作内容';doc.presentation.reading.emphasis='work';const before=structuredClone(doc);
    const compact=renderToStaticMarkup(<ReadingEditor document={doc} change={()=>{}} disabled={false} compact/>);assert.match(compact,/阅读策略/);assert.match(compact,/重点栏目/);assert.match(compact,/阅读顺序/);assert.match(compact,/<details><summary>调整阅读顺序<\/summary><fieldset/);assert.ok(!compact.includes('<details open'));assert.match(compact,/上移工作经历/);assert.deepEqual(doc,before);
    const draft=new DraftSession();draft.attach(null,doc,[],false);const api=new LocalTextApi();const disconnected=renderToStaticMarkup(<TextPanel draft={draft} api={api} connection={null} configure={()=>{}}/>);
    assert.match(disconnected,/文本 AI · 未连接/);assert.match(disconnected,/前往 AI 助手设置/);assert.match(disconnected,/当前发送栏目/);assert.match(disconnected,/能力说明与 MCP 高级选项/);assert.ok(!disconnected.includes('<details open'));assert.match(disconnected,/可能计费/);assert.match(disconnected,/可采纳正文仅限/);
    const failed=renderToStaticMarkup(<TextPanel draft={draft} api={api} connection={null} session={{csrfToken:'0'.repeat(64),connections:{text:'failed',image:'unavailable',mcp:'disabled'}}} configure={()=>{}}/>);assert.match(failed,/连接检测失败/);assert.ok(!failed.includes('文本 AI · 已连接'));
    const connected=renderToStaticMarkup(<TextPanel draft={draft} api={api} connection={{id:crypto.randomUUID(),baseUrl:'https://fictional.example/v1',model:'fictional'}}/>);assert.match(connected,/文本 AI · 已连接/);assert.match(connected,/fictional.example\/v1/);assert.match(connected,/允许将以上内容发送/);assert.ok(connected.indexOf('对话要求')<connected.indexOf('能力说明与 MCP 高级选项'));draft.dispose();
});
test('TASTE-01: partial Object URL allocation failure preserves prior pages and releases only newly allocated links',async t=>{
    t.mock.timers.enable({apis:['setTimeout']});let count=0;const revoked:string[]=[];
    t.mock.method(URL,'createObjectURL',()=>{if(++count===3)throw new Error('FICTIONAL_URL_FAILURE');return `blob:partial-${count}`;});t.mock.method(URL,'revokeObjectURL',(url:string)=>revoked.push(url));
    let pages=1;const session=new PreviewSession(async()=>({blobs:Array.from({length:pages},()=>new Blob(['fictional'])),plans:[],revision:0}));t.after(()=>session.dispose());const doc=emptyDocument();session.update(doc,{});t.mock.timers.tick(180);await flush();const initial=session.getSnapshot().urls;session.presented(initial);
    pages=2;session.update(doc,{});t.mock.timers.tick(180);await flush();assert.equal(session.getSnapshot().urls,initial);assert.match(session.getSnapshot().error,/URL_FAILURE/);assert.deepEqual(revoked,['blob:partial-2']);assert.ok(!revoked.includes(initial[0]));
});
