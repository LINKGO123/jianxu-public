import { z } from 'zod';
import { IMPORT_LIMITS } from './core.js';
export function parseFile(file:File,signal:AbortSignal) {
    return new Promise<z.infer<typeof resultSchema>>((resolve,reject)=>{
        if(file.size===0||file.size>IMPORT_LIMITS.bytes){reject(new Error('文件为空或超过 15 MiB。'));return;}
        const worker=new Worker(new URL('./parser.worker.ts',import.meta.url),{type:'module'});
        let settled=false;
        const timeout=setTimeout(()=>finish(new Error('解析超过 20 秒，已停止；当前草稿未改变。')),IMPORT_LIMITS.timeout);
        function finish(error?:Error,value?:z.infer<typeof resultSchema>){if(settled)return;settled=true;clearTimeout(timeout);worker.terminate();signal.removeEventListener('abort',abort);if(error)reject(error);else if(value)resolve(value);}
        function abort(){finish(new Error('已取消解析，当前草稿未改变。'));}
        signal.addEventListener('abort',abort,{once:true});if(signal.aborted){abort();return;}
        worker.onerror=()=>finish(new Error('本地解析器无法启动或文件损坏，请重试。'));
        worker.onmessage=(event:MessageEvent<unknown>)=>{const parsed=responseSchema.safeParse(event.data);if(!parsed.success)finish(new Error('解析结果无效。'));else if(!parsed.data.ok)finish(new Error(parsed.data.error));else finish(undefined,parsed.data.extracted);};
        file.arrayBuffer().then(bytes=>{if(!settled&&!signal.aborted)worker.postMessage({bytes,name:file.name,mime:file.type},[bytes]);}).catch(()=>finish(new Error('无法读取所选文件。')));
    });
}
const resultSchema=z.object({text:z.string().max(IMPORT_LIMITS.text),lines:z.array(z.object({text:z.string().max(IMPORT_LIMITS.text),ref:z.string().max(200)}).strict()).max(20000),warnings:z.array(z.string().max(500)).max(20).optional()}).strict().refine(value=>value.lines.map(line=>line.text).join('\n')===value.text,'原文与行内容不一致');
const responseSchema=z.discriminatedUnion('ok',[z.object({ok:z.literal(true),extracted:resultSchema}).strict(),z.object({ok:z.literal(false),error:z.string().max(1000)}).strict()]);
