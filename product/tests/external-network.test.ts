import test from 'node:test';
import assert from 'node:assert/strict';
import https from 'node:https';
import {EventEmitter} from 'node:events';
import {syncBuiltinESMExports} from 'node:module';
import {createCanvas} from '@napi-rs/canvas';
import {editImage} from '../server/image-routes.js';
import {createMcpOperation} from '../server/mcp-client.js';
import {safeFetch} from '../server/network.js';

test('D/E SIM-020/030: actual multipart image edit and official SDK both use pinned HTTPS; mismatches/redirects/private targets refuse before secrets/body',async t=>{
 let scenario='good',sent=0,requests=0;const bodies:string[]=[];
 const patch=t.mock.method(https,'request',(_address:unknown,options:unknown,callback:(response:unknown)=>void)=>{
  requests++;const req=new EventEmitter() as EventEmitter&{end:(body?:Buffer)=>void;destroy:()=>void};req.destroy=()=>{};
  req.end=body=>{sent++;const text=body?.toString('utf8')??'';bodies.push(text);const res=new EventEmitter() as EventEmitter&{statusCode:number;headers:Record<string,string>;destroy:()=>void;resume:()=>void};res.statusCode=scenario==='redirect'?302:scenario.startsWith('http-')?Number(scenario.slice(5)):200;res.headers={'content-type':'application/json'};res.destroy=()=>{};res.resume=()=>{};
   let result:unknown={data:[{b64_json:'FAKE_NETWORK_ONLY'}]};
   if(text.startsWith('{')){const message=JSON.parse(text);if(message.method==='initialize')result={jsonrpc:'2.0',id:message.id,result:{protocolVersion:'2025-03-26',capabilities:{tools:{}},serverInfo:{name:'fictional',version:'1'}}};else if(message.method==='tools/list')result={jsonrpc:'2.0',id:message.id,result:{tools:[]}};else{res.statusCode=202;result={};}}
   callback(res);queueMicrotask(()=>{res.emit('data',Buffer.from(scenario==='large'?'x'.repeat(20):JSON.stringify(result)));res.emit('end');});
  };
  queueMicrotask(()=>{const socket=new EventEmitter() as EventEmitter&{remoteAddress:string};socket.remoteAddress=scenario==='mismatch'?'127.0.0.1':'8.8.8.8';req.emit('socket',socket);socket.emit('secureConnect');});return req;
 });syncBuiltinESMExports();
 try{
  const canvas=createCanvas(2,2),image={base64:canvas.toBuffer('image/png').toString('base64'),width:2,height:2};
  await editImage({baseUrl:'https://8.8.8.8/v1',model:'fictional',apiKey:'FICTIONAL_NETWORK_IMAGE'},[image],'ONLY_STYLE_NO_NAME',new AbortController().signal);
  assert.ok(bodies[0].includes('name="image"'));assert.ok(bodies[0].includes('ONLY_STYLE_NO_NAME'));assert.ok(!bodies[0].includes('FICTIONAL_NETWORK_IMAGE'));
  await editImage({baseUrl:'https://8.8.8.8/v1',model:'fictional',apiKey:'FICTIONAL_NETWORK_IMAGE'},[image,image],'TWO_REFERENCES',new AbortController().signal);
  assert.ok(bodies[1].includes('name="image[]"'));assert.equal((bodies[1].match(/name="image\[\]"/g)??[]).length,2);
  for(const [status,expected] of [[401,/认证失败/],[403,/拒绝访问/],[404,/接口或模型不存在/],[415,/协议和参数/],[429,/限流或配额/],[500,/上游服务异常/]] as const){
   scenario=`http-${status}`;
   await assert.rejects(editImage({baseUrl:'https://8.8.8.8/v1',model:'fictional',apiKey:'FICTIONAL_NETWORK_IMAGE'},[image],'PROBE',new AbortController().signal),error=>{
    assert.ok(error instanceof Error);assert.match(error.message,expected);assert.equal((error as import('../shared/connection-diagnostics.js').ConnectionError).diagnostic.upstreamStatus,status);assert.ok(!error.message.includes('FICTIONAL_NETWORK_IMAGE'));return true;
   });
  }
  scenario='good';
  const manifest=await createMcpOperation()({baseUrl:'https://8.8.8.8/mcp',apiKey:'FICTIONAL_NETWORK_MCP'},new AbortController().signal);assert.equal(manifest.manifest.tools.length,0);assert.ok(bodies.some(body=>body.includes('initialize')));
  scenario='mismatch';const before=sent;await assert.rejects(safeFetch('https://8.8.8.8/mcp',{method:'POST',body:'secret'}));assert.equal(sent,before);
  scenario='redirect';const count=requests;await assert.rejects(safeFetch('https://8.8.8.8/mcp'));assert.equal(requests,count+1);
  scenario='large';const response=await safeFetch('https://8.8.8.8/mcp',{},10);await assert.rejects(response.text());
  const previous=requests;await assert.rejects(safeFetch('https://127.0.0.1/mcp'));assert.equal(requests,previous);
 }finally{patch.mock.restore();syncBuiltinESMExports();}
});
