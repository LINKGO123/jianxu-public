import {z} from 'zod';
import {ConnectionError,httpConnectionError} from '../shared/connection-diagnostics.js';
import type {ImageConnection,NormalizedImage} from '../shared/portrait-ai.js';
import {safeFetch} from './network.js';
import {normalizeImage} from './image-codec.js';

export type ImageEditOptions={size?:string;negativePrompt?:string};
const resultSchema=z.object({data:z.array(z.object({url:z.string().url().max(8192)})).length(1)});
const errorSchema=z.object({code:z.string().optional(),error:z.object({code:z.string()}).optional()});

export async function qwenEditImage(config:ImageConnection,images:NormalizedImage[],prompt:string,signal:AbortSignal,onGenerated?:(address:string)=>void,options?:ImageEditOptions){
 for(const image of images){
  if(Buffer.byteLength(image.base64,'base64')>10_000_000||Math.max(image.width,image.height)>8000||Math.max(image.width/image.height,image.height/image.width)>10)throw new ConnectionError('千问参考照片需小于10MB、边长不超过8000像素且长宽比不超过10:1，请先裁切或缩小照片。',{code:'REQUEST_REJECTED',stage:'operation'});
 }
 const references=images.map(image=>`data:image/png;base64,${image.base64}`);
 const response=await safeFetch(config.baseUrl+'/images/generations',{method:'POST',signal,headers:{'Content-Type':'application/json',Authorization:`Bearer ${config.apiKey}`},body:JSON.stringify({model:config.model,prompt,image:references.length===1?references[0]:references,size:options?.size??config.size??'1024x1024',n:1,prompt_extend:false,...(options?.negativePrompt?{negative_prompt:options.negativePrompt}:{})})},64*1024,{readHttpErrors:true,proxyCompatibility:config.proxyCompatibility});
 const raw:unknown=await response.json().catch(()=>{throw response.ok?new ConnectionError('千问未返回有效的图片结果JSON。',{code:'RESPONSE_FORMAT',stage:'response'}):httpConnectionError(response.status);});
 const error=errorSchema.safeParse(raw),code=error.success?(error.data.error?.code??error.data.code):undefined;
 if(!response.ok||code){
  const classified=code==='Throttling'||code==='Throttling.RateQuota'?'RATE_LIMITED':code==='InsufficientBalance'||code==='QuotaExhausted'||code==='Arrearage'?'QUOTA_EXHAUSTED':code==='DataInspectionFailed'||code==='OutputImageSensitiveContentDetected'?'CONTENT_REJECTED':undefined;
  if(classified)throw new ConnectionError(classified==='RATE_LIMITED'?'千问请求过于频繁，请稍后重试。':classified==='QUOTA_EXHAUSTED'?'千问额度或余额不足，请到服务商控制台检查。':'千问未通过内容审核，请调整照片或风格要求。',{code:classified,stage:'http',upstreamStatus:response.status});
  if(response.ok)throw new ConnectionError('千问返回错误，未获得图片，请核对模型和设置。',{code:'REQUEST_REJECTED',stage:'http',upstreamStatus:response.status});
  throw httpConnectionError(response.status);
 }
 const parsed=resultSchema.safeParse(raw);
 if(!parsed.success)throw new ConnectionError('千问未返回单张图片链接，未标记为生成成功。',{code:'RESPONSE_FORMAT',stage:'response'});
 const address=parsed.data.data[0].url;
 if(address.includes(config.apiKey))throw new ConnectionError('千问结果链接包含连接凭据，已拒绝下载。',{code:'RESPONSE_FORMAT',stage:'response'});
 signal.throwIfAborted();onGenerated?.(address);
 return {data:[{b64_json:(await downloadQwenImage(address,config,signal)).base64}]};
}
export async function downloadQwenImage(address:string,config:Pick<ImageConnection,'resultProxyCompatibility'>,signal:AbortSignal){
 let phase:'download'|'decode'='download';
 try{
  const download=await safeFetch(address,{signal},15*1024*1024,{imageResult:true,imageResultProxyCompatibility:config.resultProxyCompatibility});
  if(!download.ok){await download.body?.cancel();throw httpConnectionError(download.status);}
  const mime=download.headers.get('content-type')?.split(';')[0].trim().toLowerCase();
  if(mime!=='image/png'&&mime!=='image/jpeg'&&mime!=='image/webp'){await download.body?.cancel();throw new ConnectionError('结果不是支持的图片格式。',{code:'RESPONSE_FORMAT',stage:'response'});}
  const bytes=Buffer.from(await download.arrayBuffer());phase='decode';
  const image=await normalizeImage({base64:bytes.toString('base64'),mime},signal);
  return image;
 }catch(error){
  signal.throwIfAborted();
  const causeCode=error instanceof ConnectionError?error.diagnostic.code:phase==='decode'?'IMAGE_DECODE_FAILED':'IMAGE_READ_FAILED';
  const reason=causeCode==='TARGET_REJECTED'?'结果图片地址被拦截。若使用VPN，请在千问高级设置开启“使用本机 VPN／代理兼容模式”；未知结果域名仍需公网DNS。':causeCode==='DNS_FAILED'?'结果图片域名无法解析，请检查VPN或DNS设置。':causeCode==='NETWORK_FAILED'?'结果图片网络或TLS连接失败。':causeCode==='RESPONSE_FORMAT'?'结果返回的内容不是支持的图片格式。':phase==='decode'?'结果图片下载完成，但图片解码失败。':'结果图片下载失败，请查看具体原因及服务商HTTP状态。';
  throw new ConnectionError(reason+' 不要重复生成，以免再次计费。',{code:'IMAGE_DOWNLOAD_FAILED',stage:error instanceof ConnectionError?error.diagnostic.stage:'response',causeCode,targetHost:new URL(address).hostname,...(error instanceof ConnectionError&&error.diagnostic.upstreamStatus?{upstreamStatus:error.diagnostic.upstreamStatus}:{})});
 }
}
