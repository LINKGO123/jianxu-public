import type {ImageConnection} from '../shared/portrait-ai.js';
import type {z} from 'zod';
import type {portraitTaskStatusSchema} from '../shared/portrait-ai.js';
import type {PortraitInput} from '../shared/portrait-ai.js';
import type {ActiveTask} from './external-session.js';
import type {McpConfig,ToolManifest} from '../shared/mcp.js';
export type ImageSession={id:string;config:ImageConnection;status:'configured'|'connected'|'failed';capabilities:{single:boolean;multiple:boolean};credentialsVerified?:boolean;modelListed?:boolean;portraitTask?:(z.infer<typeof portraitTaskStatusSchema>&{timer:ReturnType<typeof setTimeout>});active?:ActiveTask;check?:{network:string;generation:string;download:string;referenceCount?:1|2};pendingDownload?:{id:string;kind:'test'|'portrait';expiresAt:number;timer:ReturnType<typeof setTimeout>;capabilities?:{single:boolean;multiple:boolean};portrait?:Omit<PortraitInput,'connectionId'|'images'>;retry:(signal:AbortSignal)=>Promise<Record<string,unknown>>}};
export type McpSession={id:string;config:McpConfig;status:'configured'|'connected'|'failed';active?:ActiveTask;manifest?:ToolManifest;approved:string[];roundId:string;calls:number};
