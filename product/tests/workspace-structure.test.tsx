import test from 'node:test';
import assert from 'node:assert/strict';
import {renderToStaticMarkup} from 'react-dom/server';
import {HistoryVersions} from '../client/App.js';
import {emptyDocument,type Snapshot} from '../shared/schemas.js';

test('WS06 history identifies each snapshot and never treats another document with the same revision as current',()=>{
    const current=emptyDocument();current.basic.name='虚构当前稿';current.basic.role='虚构岗位甲';
    const other=emptyDocument();other.basic.name='<虚构另一稿>';other.basic.role='虚构岗位乙';
    const blank=emptyDocument();
    const history:Snapshot[]=[current,other,blank].map(document=>({id:crypto.randomUUID(),createdAt:'2026-11-14T00:00:00.000Z',source:'manual',document}));
    const html=renderToStaticMarkup(<HistoryVersions document={current} history={history} busy={false} restore={()=>{}} remove={()=>{}}/>);
    assert.match(html,/虚构当前稿 · 虚构岗位甲/);
    assert.match(html,/&lt;虚构另一稿&gt; · 虚构岗位乙/);
    assert.match(html,/姓名未填写 · 求职方向未填写/);
    assert.equal((html.match(/与当前稿件同一修订/g)??[]).length,1);
    const newer={...current,revision:current.revision+1};
    assert.doesNotMatch(renderToStaticMarkup(<HistoryVersions document={newer} history={history} busy={true} restore={()=>{}} remove={()=>{}}/>),/与当前稿件同一修订/);
});
