import test from 'node:test';
import assert from 'node:assert/strict';
import {renderToStaticMarkup} from 'react-dom/server';
import {SourceEvidence,sourceLabel} from '../client/SourceEvidence.js';
import {applyImportIntent} from '../client/import/intent.js';
import {emptyDocument} from '../shared/schemas.js';
import {ConnectionFeedback,connectionMessage} from '../client/ConnectionFeedback.js';
test('FE01: source disclosure retains original references and escaped excerpt',()=>{
 const doc=emptyDocument();doc.sourceText='<script>fictional</script>';doc.sourceLocations=[{ref:'word/header1.xml:paragraph:2',start:0,end:doc.sourceText.length}];
 const html=renderToStaticMarkup(<SourceEvidence refs={['word/header1.xml:paragraph:2']} document={doc}/>);
 assert.match(html,/<details class="source-evidence"><summary>查看导入原文（1处）/);assert.match(html,/Word页眉第2段/);assert.match(html,/word\/header1.xml/);assert.match(html,/&lt;script&gt;/);assert.ok(!html.includes('<script>'));assert.equal(sourceLabel('word/document.xml:paragraph:8'),'Word正文第8段');
});
test('FE02: only this import explicit intent overrides parsing, with original facts and revision retained',()=>{
 const parsed=emptyDocument();parsed.basic.role='虚构原稿岗位';parsed.sourceText='求职方向：虚构原稿岗位';parsed.revision=7;
 assert.deepEqual(applyImportIntent(parsed,{}),parsed);
 const next=applyImportIntent(parsed,{role:'虚构新目标',profile:'experienced'});assert.equal(next.basic.role,'虚构新目标');assert.equal(next.presentation.reading.profile,'experienced');assert.equal(next.sourceText,parsed.sourceText);assert.equal(next.revision,7);assert.equal(parsed.basic.role,'虚构原稿岗位');assert.equal(parsed.presentation.reading.profile,null);
 const cleared=applyImportIntent(next,{role:'',profile:null});assert.equal(cleared.basic.role,'');assert.equal(cleared.presentation.reading.profile,null);
});
test('FE07: task feedback shares plain reasons, retains technical detail and unknown business errors',()=>{
 const raw='[RATE_OR_QUOTA · 服务商HTTP 429] fictional.example';const html=renderToStaticMarkup(<ConnectionFeedback message={raw} error/>);assert.match(html,/role="alert"/);assert.match(html,/账户余额/);assert.match(html,/<details>/);assert.match(html,/fictional.example/);
 assert.equal(connectionMessage('保存失败，内容保留'),'保存失败，内容保留');assert.match(connectionMessage('[IMAGE_DOWNLOAD_FAILED] HTTP 503 example'),/避免重复生成/);
});

test('FE05: custom model on the official text host keeps its unique editable input',async()=>{
 const {TextConnection}=await import('../client/text-ai/TextConnection.js');const {LocalTextApi}=await import('../client/text-ai/api.js');
 const session={csrfToken:'a'.repeat(64),connections:{text:'connected' as const,image:'unavailable' as const,mcp:'disabled' as const},textConnection:{id:crypto.randomUUID(),baseUrl:'https://api.deepseek.com',model:'fictional-custom'}};
 const html=renderToStaticMarkup(<TextConnection api={new LocalTextApi()} session={session} refresh={async()=>{}}/>);assert.match(html,/option value="custom" selected/);assert.equal((html.match(/value="fictional-custom"/g)??[]).length,1);
});

test('FE05: official image host with a non-default model restores the custom input',async()=>{
 const {ExternalConnections}=await import('../client/external/Connections.js');const {LocalTextApi}=await import('../client/text-ai/api.js');
 const session={csrfToken:'a'.repeat(64),connections:{text:'unavailable' as const,image:'connected' as const,mcp:'disabled' as const},imageConnection:{id:crypto.randomUUID(),provider:'openai' as const,baseUrl:'https://api.openai.com/v1',model:'fictional-custom-image-model',capabilities:{single:true,multiple:false}}};
 const html=renderToStaticMarkup(<ExternalConnections api={new LocalTextApi()} session={session} refresh={async()=>{}}/>);assert.match(html,/option value="custom" selected/);assert.equal((html.match(/value="fictional-custom-image-model"/g)??[]).length,1);
});
