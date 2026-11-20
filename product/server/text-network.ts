import {ConnectionError,httpConnectionError} from '../shared/connection-diagnostics.js';
import type {TextConnection} from '../shared/text-ai.js';
import {connectionUrl} from './network-policy.js';
import {safeFetch} from './network.js';
export {connectionUrl,externalUrl,publicAddress,resolveTarget,assertRemote} from './network-policy.js';
export type Completion=(connection:TextConnection,messages:{role:'system'|'user';content:string}[],signal:AbortSignal)=>Promise<unknown>;
export const secureCompletion:Completion=async(connection,messages,signal)=>{
 const response=await safeFetch(connectionUrl(connection.baseUrl),{method:'POST',signal,headers:{'Content-Type':'application/json','Authorization':`Bearer ${connection.apiKey}`},body:JSON.stringify({model:connection.model,messages,stream:false,response_format:{type:'json_object'},max_tokens:8000})},512*1024,{proxyCompatibility:connection.proxyCompatibility});
 if(!response.ok){await response.body?.cancel();throw httpConnectionError(response.status);}
 if(!/^application\/(?:json|[^;]+\+json)(?:;|$)/i.test(response.headers.get('content-type')??''))throw new ConnectionError('服务未返回JSON媒体类型。',{code:'RESPONSE_FORMAT',stage:'response'});
 try{return await response.json();}catch{throw new ConnectionError('服务返回无效JSON。',{code:'RESPONSE_FORMAT',stage:'response'});}
};
