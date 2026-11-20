import test from 'node:test';
import assert from 'node:assert/strict';
import https from 'node:https';
import { syncBuiltinESMExports } from 'node:module';
import { EventEmitter } from 'node:events';
import { publicAddress,connectionUrl,resolveTarget,assertRemote,secureCompletion } from '../server/text-network.js';
test('C SIM-030: all DNS addresses and IPv4/IPv6 reservations checked; URL and actual socket target pinned',async()=>{
 for(const address of ['0.0.0.0','10.0.0.1','100.64.0.1','127.0.0.1','169.254.169.254','172.16.0.1','192.168.0.1','198.19.0.1','192.0.2.1','203.0.113.1','224.0.0.1','255.255.255.255','::','::1','::ffff:8.8.8.8','fc00::1','fe80::1','2001:db8::1','2002:0808:0808::1','3fff::1'])assert.equal(publicAddress(address),false,address);
 assert.equal(publicAddress('8.8.8.8'),true);assert.equal(publicAddress('2001:4860:4860::8888'),true);
 for(const url of ['http://example.com','https://user:pass@example.com','https://example.com:8443','https://example.com/?key=x','https://localhost','https://example.com/#x'])assert.throws(()=>connectionUrl(url));
 const url=connectionUrl('https://example.com/v1');assert.equal(url.pathname,'/v1/chat/completions');
 await assert.rejects(resolveTarget(url,async()=>[{address:'8.8.8.8',family:4},{address:'127.0.0.1',family:4}]),/私网/);
 const target=await resolveTarget(url,async()=>[{address:'8.8.8.8',family:4}]);assert.equal(target.address,'8.8.8.8');assert.throws(()=>assertRemote('127.0.0.1',target.address));assert.throws(()=>assertRemote('1.1.1.1',target.address));assert.doesNotThrow(()=>assertRemote('2001:4860:4860:0:0:0:0:8888','2001:4860:4860::8888'));
});
test('C SIM-013/020/030: native HTTPS orchestration sends only after matching secure socket; redirects/limits/errors blocked',async t=>{
 const config={baseUrl:'https://8.8.8.8/v1',model:'fictional',apiKey:'FICTIONAL_NETWORK_SECRET'};let scenario='success',requests=0,sends=0;
 const mock=t.mock.method(https,'request',(_url:unknown,_options:unknown,callback:(res:unknown)=>void)=>{
  requests++;const req=new EventEmitter() as EventEmitter&{end:(body:string)=>void;destroy:()=>void};req.destroy=()=>{};req.end=()=>{sends++;const res=new EventEmitter() as EventEmitter&{statusCode:number;headers:Record<string,string>;destroy:()=>void};res.headers={'content-type':scenario==='type'?'text/html':'application/json',...(scenario==='redirect'?{location:'http://169.254.169.254/latest/meta-data'}:{})};res.statusCode=scenario==='redirect'?302:scenario==='401'?401:scenario==='429'?429:200;res.destroy=()=>{};callback(res);queueMicrotask(()=>{res.emit('data',Buffer.from(scenario==='large'?'x'.repeat(512*1024+1):scenario==='bad'?'not JSON':'{"choices":[{"message":{"content":"{}"}}]}'));res.emit('end');});};
  queueMicrotask(()=>{const socket=new EventEmitter() as EventEmitter&{remoteAddress:string};socket.remoteAddress=scenario==='mismatch'?'127.0.0.1':'8.8.8.8';req.emit('socket',socket);if(scenario==='tls')req.emit('error',new Error('FICTIONAL_TLS_ERROR'));else socket.emit('secureConnect');});return req;
 });syncBuiltinESMExports();
 try{await secureCompletion(config,[],new AbortController().signal);assert.equal(sends,1);
  for(scenario of ['mismatch','redirect','401','429','large','bad','tls','type']){const beforeRequests:number=requests,beforeSends:number=sends;await assert.rejects(secureCompletion(config,[],new AbortController().signal));assert.equal(requests,beforeRequests+1);if(scenario==='mismatch'||scenario==='tls')assert.equal(sends,beforeSends);}
 }finally{mock.mock.restore();syncBuiltinESMExports();}
});
