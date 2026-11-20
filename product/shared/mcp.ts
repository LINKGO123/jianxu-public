import {z} from 'zod';
export const mcpConfigSchema=z.object({baseUrl:z.string().url().max(2048),apiKey:z.string().max(512).refine(key=>!(/[^\x21-\x7e]/.test(key)))}).strict();
export type McpConfig=z.infer<typeof mcpConfigSchema>;
export const toolSchema=z.object({name:z.string().min(1).max(100),description:z.string().max(4000),inputSchema:z.record(z.string(),z.json()),eligible:z.boolean()}).strict();
export const toolManifestSchema=z.object({id:z.string().regex(/^[a-f0-9]{64}$/),tools:z.array(toolSchema).max(30)}).strict();
export type ToolManifest=z.infer<typeof toolManifestSchema>;
export const mcpCallSchema=z.object({connectionId:z.string().uuid(),requestId:z.string().uuid(),manifestId:z.string().regex(/^[a-f0-9]{64}$/),roundId:z.string().uuid(),name:z.string().min(1).max(100),arguments:z.record(z.string(),z.json()),consent:z.literal(true)}).strict().refine(value=>JSON.stringify(value.arguments).length<=16000);
export const toolProposalSchema=z.object({name:z.string().min(1).max(100),arguments:z.record(z.string(),z.json()),reason:z.string().min(1).max(500)}).strict().refine(value=>JSON.stringify(value.arguments).length<=16000);
