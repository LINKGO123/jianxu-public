import {ConnectionError,connectionDiagnostic} from '../shared/connection-diagnostics.js';
import type {FastifyReply,FastifyRequest} from 'fastify';
import type {LocalSession} from './text-routes.js';
import type {ImageSession} from './external-types.js';
export class UserError extends Error{}
export type ActiveTask={id:string;controller:AbortController};
export function clearImageDownload(connection:ImageSession|undefined){if(connection?.pendingDownload){clearTimeout(connection.pendingDownload.timer);delete connection.pendingDownload;}}
export function clearPortraitTask(connection:ImageSession|undefined){if(connection?.portraitTask){clearTimeout(connection.portraitTask.timer);delete connection.portraitTask;}}
export function clearConnections(session:LocalSession){session.active?.controller.abort();session.image?.active?.controller.abort();clearImageDownload(session.image);clearPortraitTask(session.image);session.mcp?.active?.controller.abort();delete session.text;delete session.image;delete session.mcp;}
export function rejectSecrets(value:unknown,session:LocalSession){
 const secrets=[session.text?.config.apiKey,session.image?.config.apiKey,session.mcp?.config.apiKey].filter((s):s is string=>!!s);
 JSON.stringify(value,(_key,item)=>{if(typeof item==='string'&&secrets.some(key=>item.includes(key)))throw new UserError('外部结果包含会话凭据，已拒绝。');return item;});
}
export async function runExternal(request:FastifyRequest,reply:FastifyReply,kind:'image'|'mcp',id:string,connectionId:string,timeout:number,operation:(signal:AbortSignal)=>Promise<Record<string,unknown>>,commit?:()=>void,failed?:()=>void){
 const session=request.localSession,connection=session[kind];
 if(!connection||connection.id!==connectionId)return reply.code(409).send({error:'连接已更改或未配置，请刷新并重新核对发送目标。'});
 if(connection.active)return reply.code(409).send({error:'已有同类任务，请等待或取消。'});
 const controller=new AbortController(),task={id,controller};connection.active=task;
 const timer=setTimeout(()=>controller.abort(),timeout),disconnect=()=>{if(!reply.raw.writableEnded)controller.abort();};reply.raw.on('close',disconnect);
 try{
  const result=await operation(controller.signal);
  if(session.expires<=Date.now()){clearConnections(session);return reply.code(401).send({error:'会话已到期，请重新配置。'});}
  if(controller.signal.aborted||session[kind]!==connection)throw new UserError('任务取消、超时或配置已变，结果未应用。');
  rejectSecrets(result,session);commit?.();return result;
 }catch(error){
  const expired=session.expires<=Date.now();if(expired)clearConnections(session);else if(!controller.signal.aborted&&session[kind]===connection)failed?.();
  return reply.code(expired?401:controller.signal.aborted?499:502).send({diagnostic:connectionDiagnostic(error,controller.signal.aborted,expired),error:expired?'会话已到期，请重新配置。':controller.signal.aborted?'任务已取消或超时，结果未应用；不承诺撤销上游计费。':error instanceof UserError||error instanceof ConnectionError?error.message:'外部操作失败，未应用结果；请检查能力、权限、格式或网络后手动重试。'});
 }finally{clearTimeout(timer);reply.raw.off('close',disconnect);if(connection.active===task)delete connection.active;}
}
