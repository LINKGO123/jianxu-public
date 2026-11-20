import {z} from 'zod';
import {ConnectionError,httpConnectionError} from '../shared/connection-diagnostics.js';
import {isBase64Text,type ImageConnection,type NormalizedImage} from '../shared/portrait-ai.js';
import {safeFetch} from './network.js';
import {normalizeImage} from './image-codec.js';
import type {ImageEditOptions} from './qwen-image.js';
const responseSchema=z.object({data:z.array(z.object({b64_json:z.string().min(4).max(20*1024*1024).refine(isBase64Text)})).length(1)});
const errorSchema=z.object({error:z.object({code:z.string()})});
export async function seedreamEditImage(config:ImageConnection,images:NormalizedImage[],prompt:string,signal:AbortSignal,options?:ImageEditOptions,onReceived?:()=>void){
 if(images.some(image=>image.width<15||image.height<15||Math.max(image.width/image.height,image.height/image.width)>16))throw new ConnectionError('豆包参考图边长须大于14像素，长宽比不超过16:1，请重新裁切。',{code:'REQUEST_REJECTED',stage:'operation'});
 const references=images.map(image=>`data:image/png;base64,${image.base64}`);
 const response=await safeFetch(config.baseUrl+'/images/generations',{method:'POST',signal,headers:{'Content-Type':'application/json',Authorization:`Bearer ${config.apiKey}`},body:JSON.stringify({model:config.model,prompt,image:references.length===1?references[0]:references,size:options?.size??'2048x2048',response_format:'b64_json',output_format:'png',stream:false,watermark:false})},24*1024*1024,{readHttpErrors:true,proxyCompatibility:config.proxyCompatibility});
 const raw:unknown=await response.json().catch(()=>{throw response.ok?new ConnectionError('豆包未返回完整JSON；请勿自动重复生成，上游可能已受理。',{code:'RESPONSE_FORMAT',stage:'response'}):httpConnectionError(response.status);});
 const failure=errorSchema.safeParse(raw);
 if(!response.ok||failure.success){
  const code=failure.success?failure.data.error.code:'';
  const classified=/^InvalidApiKey/.test(code)?'AUTH_FAILED':code==='ModelNotOpen'?'MODEL_NOT_OPEN':/^InvalidEndpointOrModel\./.test(code)?'ENDPOINT_NOT_FOUND':/^(QuotaExceeded|InsufficientBalance|AccountOverdue)/.test(code)?'QUOTA_EXHAUSTED':/^RateLimitExceeded/.test(code)?'RATE_LIMITED':/^(InputImageSensitiveContentDetected|OutputImageSensitiveContentDetected|SensitiveContentDetected)/.test(code)?'CONTENT_REJECTED':undefined;
  if(classified)throw new ConnectionError(classified==='AUTH_FAILED'?'方舟密钥验证失败。':classified==='MODEL_NOT_OPEN'?'模型存在但你尚未开通：请到火山方舟控制台开通该模型，或改用已开通的接入点ID。':classified==='ENDPOINT_NOT_FOUND'?'方舟没有这个模型或接入点ID，请核对模型名或接入点。':classified==='QUOTA_EXHAUSTED'?'方舟账户余额或额度不足，请检查账单。':classified==='RATE_LIMITED'?'方舟请求过于频繁，请稍后再试。':'方舟未通过内容审核，请调整照片或要求。',{code:classified,stage:'http',upstreamStatus:response.status});
  if(!response.ok)throw httpConnectionError(response.status);
  throw new ConnectionError('方舟返回生成错误，未获得可用图片。',{code:'REQUEST_REJECTED',stage:'response'});
 }
 const result=responseSchema.safeParse(raw);
 if(!result.success)throw new ConnectionError('豆包未返回单张Base64图片；不跟随结果链接、不自动重试，以免重复计费。',{code:'RESPONSE_FORMAT',stage:'response'});
 onReceived?.();
 const base64=result.data.data[0].b64_json,bytes=Buffer.from(base64,'base64');
 // Some endpoints return JPEG despite the PNG preference; normalize actual image bytes before the shared PNG pipeline.
 const mime=bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))?'image/png':bytes[0]===255&&bytes[1]===216?'image/jpeg':bytes.toString('ascii',0,4)==='RIFF'&&bytes.toString('ascii',8,12)==='WEBP'?'image/webp':null;
 if(!mime)throw new ConnectionError('豆包返回的图片签名不支持，未应用。',{code:'RESPONSE_FORMAT',stage:'response'});
 const image=await normalizeImage({base64,mime},signal).catch(()=>{signal.throwIfAborted();throw new ConnectionError('豆包已返回图片数据，但解码失败；请勿重复生成，以免再次计费。',{code:'IMAGE_DOWNLOAD_FAILED',stage:'response',causeCode:'IMAGE_DECODE_FAILED'});});
 return {data:[{b64_json:image.base64}]};
}

export async function verifySeedreamCredentials(config:ImageConnection,signal:AbortSignal){
 const response=await safeFetch(config.baseUrl+'/models',{signal,headers:{Authorization:`Bearer ${config.apiKey}`}},1024*1024,{proxyCompatibility:config.proxyCompatibility});
 if(!response.ok){await response.body?.cancel();throw httpConnectionError(response.status);}
 const raw:unknown=await response.json().catch(()=>{throw new ConnectionError('模型查询没有返回有效JSON，未验证密钥。',{code:'RESPONSE_FORMAT',stage:'response'});});
 const models=z.object({data:z.array(z.object({id:z.string().min(1).max(200)})).max(5000)}).safeParse(raw);
 if(!models.success)throw new ConnectionError('模型查询格式不兼容，未验证密钥。',{code:'RESPONSE_FORMAT',stage:'response'});
 return {credentialsVerified:true,modelListed:models.data.data.some(model=>model.id===config.model),verified:'密钥已验证；模型目录不代表账号已开通，图片生成能力待实际任务验证。本次未调用生图。'};
}
