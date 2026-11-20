import test from 'node:test';
import assert from 'node:assert/strict';
import { parseFile } from '../client/import/task.js';
class WorkerTransport {
    static instances:WorkerTransport[]=[];
    onmessage:((event:MessageEvent<unknown>)=>void)|null=null;
    onerror:(()=>void)|null=null;
    terminated=false; sent:unknown;
    constructor(){WorkerTransport.instances.push(this);}
    postMessage(value:unknown){this.sent=value;}
    terminate(){this.terminated=true;}
    reply(value:unknown){this.onmessage?.(new MessageEvent('message',{data:value}));}
}
async function flush(){for(let i=0;i<8;i++)await Promise.resolve();}
test('SIM-005: production Worker adapter terminates on timeout/cancel and ignores late results',async t=>{
    t.mock.timers.enable({apis:['setTimeout']});const original=Object.getOwnPropertyDescriptor(globalThis,'Worker');Object.defineProperty(globalThis,'Worker',{value:WorkerTransport,configurable:true});
    try{
        const file=new File(['%PDF-1.7\nfictional'],'fictional.pdf',{type:'application/pdf'});
        const a=new AbortController(),task=parseFile(file,a.signal),cancelled=assert.rejects(task,/取消/);await flush();const first=WorkerTransport.instances.at(-1)!;a.abort();await cancelled;assert.equal(first.terminated,true);first.reply({ok:true,extracted:{text:'LATE',lines:[{text:'LATE',ref:'p:1'}]}});
        const timed=parseFile(file,new AbortController().signal),timeout=assert.rejects(timed,/20 秒/);t.mock.timers.tick(20000);await timeout;assert.equal(WorkerTransport.instances.at(-1)?.terminated,true);
        const pending=parseFile(file,new AbortController().signal);await flush();const latest=WorkerTransport.instances.at(-1)!;latest.reply({ok:true,extracted:{text:'FICTIONAL',lines:[{text:'FICTIONAL',ref:'p:1'}]}});assert.equal((await pending).text,'FICTIONAL');assert.equal(latest.terminated,true);
    }finally{if(original)Object.defineProperty(globalThis,'Worker',original);else Reflect.deleteProperty(globalThis,'Worker');}
});
test('SIM-005/029: Worker result schema rejects inconsistent original/lines instead of applying forged content',async()=>{
    const original=Object.getOwnPropertyDescriptor(globalThis,'Worker');Object.defineProperty(globalThis,'Worker',{value:WorkerTransport,configurable:true});
    try{const task=parseFile(new File(['x'],'fictional.docx'),new AbortController().signal),rejected=assert.rejects(task,/无效/);await flush();WorkerTransport.instances.at(-1)!.reply({ok:true,extracted:{text:'ORIGINAL',lines:[{text:'FORGED',ref:'p:1'}]}});await rejected;}finally{if(original)Object.defineProperty(globalThis,'Worker',original);else Reflect.deleteProperty(globalThis,'Worker');}
});
