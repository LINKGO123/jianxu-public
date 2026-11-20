import {ConnectionError,httpConnectionError} from '../shared/connection-diagnostics.js';
import {request} from 'node:https';
import {externalUrl,imageResultUrl,resolveTarget,assertRemote,proxyCompatibleHost} from './network-policy.js';
// Shared HTTPS boundary for text, image and SDK fetch: no redirects, validated DNS pinned through TLS.
export async function safeFetch(address:string|URL,init:RequestInit={},limit=512*1024,options:{proxyCompatibility?:boolean;imageResult?:boolean;imageResultProxyCompatibility?:boolean;readHttpErrors?:boolean;headersOnly?:boolean}={}):Promise<Response>{
 if(options.imageResult&&(options.proxyCompatibility||init.body||[...new Headers(init.headers)].length||(init.method&&init.method!=='GET')))throw new Error('图片下载只允许无凭据GET。');
 const url=options.imageResult?imageResultUrl(String(address)):externalUrl(String(address)),allowFakeIp=(options.imageResult?options.imageResultProxyCompatibility===true:options.proxyCompatibility===true)&&proxyCompatibleHost(url,options.imageResult),signal=init.signal??AbortSignal.timeout(15000);
 let stop!:()=>void;
 const aborted=new Promise<never>((_,reject)=>{stop=()=>reject(new Error('请求已取消或超时。'));if(signal.aborted)stop();else signal.addEventListener('abort',stop,{once:true});});
 let target:Awaited<ReturnType<typeof resolveTarget>>;
 try{target=await Promise.race([resolveTarget(url,undefined,allowFakeIp,options.imageResult),aborted]);}catch(error){
  if(signal.aborted)throw error;
  const code=error&&typeof error==='object'&&'code' in error?error.code:undefined;
  throw new ConnectionError(code==='ENOTFOUND'||code==='EAI_AGAIN'?'DNS解析失败，请核对域名与网络。':'目标地址校验失败，请使用允许的公网HTTPS服务。',{code:code==='ENOTFOUND'||code==='EAI_AGAIN'?'DNS_FAILED':'TARGET_REJECTED',stage:code==='ENOTFOUND'||code==='EAI_AGAIN'?'dns':'network'});
 }finally{signal.removeEventListener('abort',stop);}
 signal.throwIfAborted();
 const body=init.body===undefined||init.body===null?undefined:typeof init.body==='string'?Buffer.from(init.body):init.body instanceof Uint8Array?Buffer.from(init.body):null;
 if(body===null)throw new Error('外发请求体类型不支持。');
 const headers=Object.fromEntries(new Headers(init.headers).entries());if(body)headers['content-length']=String(body.length);
 return new Promise((resolve,reject)=>{
  const req=request(url,{method:init.method??'GET',agent:false,signal,headers,family:target.family,lookup:(_h,_o,cb)=>cb(null,target.address,target.family)},res=>{
   const status=res.statusCode??0;
   if(status>=300&&status<400){res.destroy();reject(new ConnectionError('服务重定向已拒绝。',{code:'REDIRECT_REJECTED',stage:'http',upstreamStatus:status}));return;}
   if(!options.readHttpErrors&&(status===401||status===403||status===429)){res.destroy();reject(httpConnectionError(status));return;}
   if(!status){res.destroy();reject(new Error('服务响应无效。'));return;}
   const outputHeaders=new Headers();for(const [key,value] of Object.entries(res.headers))if(value!==undefined)outputHeaders.set(key,Array.isArray(value)?value.join(','):value);
   if(options.headersOnly){res.destroy();resolve(new Response(null,{status,headers:outputHeaders}));return;}
   let bytes=0;
   const stream=new ReadableStream<Uint8Array>({start(controller){
    res.on('data',(chunk:Buffer)=>{bytes+=chunk.length;if(bytes>limit){controller.error(new Error('服务响应超出大小限制。'));res.destroy();}else controller.enqueue(chunk);});
    res.on('end',()=>{if(bytes<=limit)controller.close();});res.on('error',()=>controller.error(new Error('服务响应中断。')));
   },cancel(){res.destroy();}});
   if(status===204||status===205){res.resume();resolve(new Response(null,{status,headers:outputHeaders}));}else resolve(new Response(stream,{status,headers:outputHeaders}));
  });
  req.on('socket',socket=>socket.once('secureConnect',()=>{try{assertRemote(socket.remoteAddress,target.address,allowFakeIp);req.end(body);}catch{req.destroy();reject(new ConnectionError('实际连接目标不匹配，未发送凭据。',{code:'TARGET_REJECTED',stage:'network'}));}}));
  req.on('error',()=>reject(new ConnectionError(signal.aborted?'请求已取消或超时。':'连接失败，请检查TLS或网络。',{code:signal.aborted?'CANCELLED_OR_TIMEOUT':'NETWORK_FAILED',stage:'network'})));
 });
}
