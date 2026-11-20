import {Worker} from 'node:worker_threads';
import {z} from 'zod';
import {imagePayloadSchema,normalizedImageSchema,type NormalizedImage} from '../shared/portrait-ai.js';
export {imagePayloadSchema,normalizedImageSchema,type NormalizedImage} from '../shared/portrait-ai.js';
export function normalizeImage(image:z.infer<typeof imagePayloadSchema>,signal:AbortSignal):Promise<NormalizedImage>{
 const bytes=Buffer.from(image.base64,'base64');if(bytes.length>15*1024*1024)throw new Error('照片超过15 MiB。');
 return new Promise((resolve,reject)=>{
  const worker=new Worker(new URL('./image-worker.js',import.meta.url),{workerData:{bytes,mime:image.mime}});let settled=false;
  const finish=(error?:Error,value?:NormalizedImage)=>{if(settled)return;settled=true;clearTimeout(timer);signal.removeEventListener('abort',abort);void worker.terminate();if(error)reject(error);else resolve(value!);};
  const abort=()=>finish(new Error('图片解码已取消。')),timer=setTimeout(()=>finish(new Error('图片解码超时。')),20000);
  signal.addEventListener('abort',abort,{once:true});if(signal.aborted){abort();return;}
  worker.on('message',(value:unknown)=>{const parsed=normalizedImageSchema.safeParse(value);if(parsed.success)finish(undefined,parsed.data);else finish(new Error('照片签名、解码或大小无效。'));});worker.on('error',()=>finish(new Error('照片解码器无法运行。')));worker.on('exit',()=>{if(!settled)finish(new Error('照片解码意外结束。'));});
 });
}
