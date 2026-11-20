import type {FastifyInstance} from 'fastify';
import {z} from 'zod';
import {randomUUID} from 'node:crypto';
import {mcpConfigSchema,mcpCallSchema} from '../shared/mcp.js';
import {externalUrl} from './network-policy.js';
import {createMcpOperation,type McpOperation} from './mcp-client.js';
import {runExternal,UserError,rejectSecrets} from './external-session.js';
const taskSchema=z.object({connectionId:z.string().uuid(),requestId:z.string().uuid()}).strict();
export function registerMcpRoutes(app:FastifyInstance,operation:McpOperation=createMcpOperation()){
 app.put('/api/connections/mcp',async request=>{const config=mcpConfigSchema.parse(request.body);externalUrl(config.baseUrl);rejectSecrets(config.baseUrl,request.localSession);if(config.apiKey&&config.baseUrl.includes(config.apiKey))throw new UserError('地址不能包含凭据。');request.localSession.mcp?.active?.controller.abort();request.localSession.mcp={id:randomUUID(),config,status:'configured',approved:[],roundId:randomUUID(),calls:0};return {configured:true};});
 app.delete('/api/connections/mcp',async request=>{request.localSession.mcp?.active?.controller.abort();delete request.localSession.mcp;return {disabled:true};});
 app.post('/api/mcp/discover',async(request,reply)=>{
  const input=taskSchema.parse(request.body);let manifest:Awaited<ReturnType<McpOperation>>['manifest'];
  return runExternal(request,reply,'mcp',input.requestId,input.connectionId,15000,async signal=>{const result=await operation(request.localSession.mcp!.config,signal);manifest=result.manifest;return {manifest};},()=>{const connection=request.localSession.mcp!;connection.manifest=manifest;connection.approved=[];connection.calls=0;connection.roundId=randomUUID();connection.status='connected';},()=>{const connection=request.localSession.mcp!;connection.status='failed';connection.approved=[];delete connection.manifest;});
 });
 app.post('/api/mcp/approve',async request=>{
  const input=z.object({connectionId:z.string().uuid(),manifestId:z.string().regex(/^[a-f0-9]{64}$/),names:z.array(z.string().max(100)).max(30),readOnlyAcknowledged:z.literal(true)}).strict().parse(request.body),connection=request.localSession.mcp;
  if(!connection||connection.id!==input.connectionId||connection.manifest?.id!==input.manifestId||connection.active)throw new UserError('配置或清单已变化，请重新发现。');
  if(new Set(input.names).size!==input.names.length||input.names.some(name=>!connection.manifest!.tools.some(tool=>tool.name===name&&tool.eligible)))throw new UserError('允许名单中有未知或非只读工具。');
  connection.approved=input.names;return {approved:input.names,roundId:connection.roundId,remaining:5-connection.calls};
 });
 app.post('/api/mcp/call',{bodyLimit:24*1024},async(request,reply)=>{
  const input=mcpCallSchema.parse(request.body),connection=request.localSession.mcp;
  if(!connection||connection.status!=='connected'||connection.id!==input.connectionId||connection.manifest?.id!==input.manifestId||connection.roundId!==input.roundId||!connection.approved.includes(input.name)||connection.calls>=5)return reply.code(409).send({error:'MCP关闭、未授权、清单过期或本轮5次额度已用完。'});
  return runExternal(request,reply,'mcp',input.requestId,input.connectionId,15000,async signal=>{
   rejectSecrets(input.arguments,request.localSession);connection.calls++;
   const result=await operation(connection.config,signal,{manifestId:input.manifestId,name:input.name,arguments:input.arguments});
   return {result:result.result,remaining:5-connection.calls,requestId:input.requestId};
  });
 });
 app.post('/api/mcp/cancel',async request=>{const {requestId}=z.object({requestId:z.string().uuid()}).strict().parse(request.body),active=request.localSession.mcp?.active;if(active?.id===requestId)active.controller.abort();return {cancelled:active?.id===requestId};});
}
