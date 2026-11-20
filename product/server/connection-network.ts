import {ConnectionError,connectionDiagnostic} from '../shared/connection-diagnostics.js';
import type {ImageConnection} from '../shared/portrait-ai.js';
import {safeFetch} from './network.js';
import {seedreamImageBaseUrl} from '../shared/portrait-ai.js';
import {qwenResultHosts} from '../shared/image-hosts.js';
import type {FastifyInstance} from 'fastify';
import {z} from 'zod';
export async function checkConnectionNetwork(config:Pick<ImageConnection,'baseUrl'|'provider'|'proxyCompatibility'|'resultProxyCompatibility'>,signal:AbortSignal){
 const url=new URL(config.baseUrl);url.pathname=url.pathname.replace(/\/+$/,'')+'/models';
 const targets=[{url:url.href,result:false},...(config.provider==='qwen'?qwenResultHosts.map(host=>({url:`https://${host}/`,result:true})):[])];
 const checks=[];
 for(const target of targets){
  try{
   const response=await safeFetch(target.url,{signal},1024,target.result?{imageResult:true,imageResultProxyCompatibility:config.resultProxyCompatibility,readHttpErrors:true,headersOnly:true}:{proxyCompatibility:config.proxyCompatibility,readHttpErrors:true,headersOnly:true});
   await response.body?.cancel();
   if(response.status>=500||response.status===429)throw new ConnectionError('网络已到达服务，但服务暂时不可用。',{code:'UPSTREAM_ERROR',stage:'http',upstreamStatus:response.status});
   checks.push({host:new URL(target.url).hostname,httpStatus:response.status});
  }catch(error){
   if(error instanceof ConnectionError)throw new ConnectionError('网络检查未通过，未发起计费能力检测。'+error.message,{...error.diagnostic,targetHost:new URL(target.url).hostname,proxyCompatibility:Boolean(target.result?config.resultProxyCompatibility:config.proxyCompatibility)});
   throw error;
  }
 }
 return {ok:true,checks,verified:'仅证明网络可达，尚未验证密钥、模型权限或生成能力。'};
}
export function registerNetworkCheck(app:FastifyInstance){
 app.post('/api/network/check',async(request,reply)=>{
  const input=z.object({service:z.enum(['deepseek','qwen','openai','seedream']),vpnCompatibility:z.boolean()}).strict().parse(request.body);
  const baseUrl={seedream:seedreamImageBaseUrl,deepseek:'https://api.deepseek.com',qwen:'https://maas.qianwenaiapi.com/compatible-mode/v1',openai:'https://api.openai.com/v1'}[input.service];
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),30000),disconnect=()=>{if(!reply.raw.writableEnded)controller.abort();};reply.raw.on('close',disconnect);
  try{
   const result=await checkConnectionNetwork({baseUrl,provider:input.service==='qwen'?'qwen':input.service==='seedream'?'seedream':'openai',proxyCompatibility:input.vpnCompatibility,resultProxyCompatibility:input.service==='qwen'&&input.vpnCompatibility},controller.signal);
   return {...result,vpnCompatibility:input.vpnCompatibility};
  }catch(error){
   if(controller.signal.aborted)return reply.code(499).send({error:'网络预检查已取消或超时，没有调用模型。',diagnostic:connectionDiagnostic(error,true)});
   if(error instanceof ConnectionError)return reply.code(502).send({error:error.message,diagnostic:error.diagnostic});
   return reply.code(502).send({error:'网络预检查未完成；没有调用模型或保存密钥。'});
  }finally{clearTimeout(timer);reply.raw.off('close',disconnect);}
 });
}
