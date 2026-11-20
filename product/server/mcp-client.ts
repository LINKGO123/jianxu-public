import {ConnectionError,httpConnectionError} from '../shared/connection-diagnostics.js';
import {Client} from '@modelcontextprotocol/sdk/client';
import {StreamableHTTPClientTransport} from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import {ToolListChangedNotificationSchema} from '@modelcontextprotocol/sdk/types.js';
import {createHash} from 'node:crypto';
import type {McpConfig,ToolManifest} from '../shared/mcp.js';
import {toolManifestSchema} from '../shared/mcp.js';
import {safeFetch} from './network.js';
import {externalUrl} from './network-policy.js';
import {boundedToolSchema,toolValidator} from './tool-schema.js';
import {UserError} from './external-session.js';
export type McpOperation=(config:McpConfig,signal:AbortSignal,call?:{manifestId:string;name:string;arguments:Record<string,unknown>})=>Promise<{manifest:ToolManifest;result?:unknown}>;
export function manifestId(tools:unknown){
 function canonical(value:unknown):unknown{if(Array.isArray(value))return value.map(canonical);if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).sort(([a],[b])=>a.localeCompare(b)).map(([key,item])=>[key,canonical(item)]));return value;}
 return createHash('sha256').update(JSON.stringify(canonical(tools))).digest('hex');
}
export function createMcpOperation(fetcher:typeof safeFetch=safeFetch):McpOperation{return async(config,signal,call)=>{
 const url=externalUrl(config.baseUrl);let changed=false;let connectionError:ConnectionError|undefined;
 const transport=new StreamableHTTPClientTransport(url,{requestInit:{headers:config.apiKey?{Authorization:`Bearer ${config.apiKey}`}:{},redirect:'error'},reconnectionOptions:{maxRetries:0,maxReconnectionDelay:0,initialReconnectionDelay:0,reconnectionDelayGrowFactor:1},fetch:async(address,init)=>{
  if(externalUrl(String(address)).href!==url.href)throw new UserError('MCP试图访问未授权目标，已拒绝。');
  connectionError=undefined;
  try{const response=await fetcher(address,{...init,signal:AbortSignal.any([signal,...(init?.signal?[init.signal]:[])])},512*1024);if(!response.ok)connectionError=httpConnectionError(response.status);return response;}catch(error){if(error instanceof ConnectionError)connectionError=error;throw error;}
 }});
 const client=new Client({name:'jianxu-local',version:'1.0.0'},{capabilities:{},jsonSchemaValidator:toolValidator});
 client.setNotificationHandler(ToolListChangedNotificationSchema,()=>{changed=true;});
 const abort=()=>{void client.close().catch(()=>{changed=true;});};signal.addEventListener('abort',abort,{once:true});
 try{
  signal.throwIfAborted();await client.connect(transport,{signal,timeout:15000});
  const listed=await client.listTools(undefined,{signal,timeout:15000});
  if(listed.nextCursor||listed.tools.length>30)throw new UserError('首版仅支持一次发现最多30个工具，不自动翻页。');
  const tools=listed.tools.map(tool=>{boundedToolSchema(tool.inputSchema);return {name:tool.name,description:tool.description??'',inputSchema:tool.inputSchema,eligible:tool.annotations?.readOnlyHint===true&&tool.annotations?.destructiveHint===false&&!hasUnsafeAction(tool.name)};}).sort((a,b)=>a.name.localeCompare(b.name));
  const manifest=toolManifestSchema.parse({id:manifestId(tools),tools});
  if(changed)throw new UserError('工具列表已变更，请重新发现并确认允许名单。');
  if(!call)return {manifest};
  if(call.manifestId!==manifest.id)throw new UserError('工具列表或参数已变更，请重新发现并确认。');
  const tool=manifest.tools.find(tool=>tool.name===call.name);
  if(!tool?.eligible)throw new UserError('工具不满足只读与非破坏标注，已拒绝。');
  if(!toolValidator.getValidator(tool.inputSchema)(call.arguments).valid)throw new UserError('工具参数不符合已确认结构，已拒绝。');
  const result=await client.callTool({name:call.name,arguments:call.arguments},undefined,{signal,timeout:15000});
  if(changed)throw new UserError('执行期间工具列表发生变化，结果未展示，请重新确认。');
  if(Buffer.byteLength(JSON.stringify(result),'utf8')>128*1024)throw new UserError('工具结果超过128 KiB。');
  return {manifest,result};
 }catch(error){throw connectionError??error;}finally{signal.removeEventListener('abort',abort);await client.close();}
};}

function hasUnsafeAction(name:string){
 const words=name.normalize('NFKC').replace(/([A-Z])([A-Z][a-z])/g,'$1 $2').replace(/([a-z0-9])([A-Z])/g,'$1 $2').toLowerCase().split(/[^a-z0-9]+/);
 // shortcut: action prefixes also reject benign names such as getPatchNotes; names cannot prove remote read-only behavior.
 return words.some(word=>/^(?:write|delete|remove|send|exec|run|shell|stdio|upload|update|create|publish|submit|install|patch)/.test(word));
}
