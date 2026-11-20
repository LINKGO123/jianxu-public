import {z} from 'zod';
import {textConnectionSchema} from './text-ai.js';
import {diagnosticSchema} from './connection-diagnostics.js';
import {portraitTaskSummarySchema,yearbookSchema} from './schemas.js';
export const qwenImageBaseUrl='https://maas.qianwenaiapi.com/compatible-mode/v1';
export const seedreamImageBaseUrl='https://ark.cn-beijing.volces.com/api/v3';
export const seedreamDefaultModel='doubao-seedream-5-0-pro-260628';
export const seedreamFlashModel='doubao-seedream-5-0-flash-260915';
export const seedreamModelSchema=z.string().max(100).regex(/^(doubao-seedream-5-0-(pro|flash)-[0-9]+|ep-[A-Za-z0-9-]+)$/);
export const imageConnectionSchema=textConnectionSchema.extend({provider:z.enum(['openai','qwen','seedream']).optional(),size:z.enum(['1024x1024','2048x2048']).optional(),resultProxyCompatibility:z.boolean().optional()});
export type ImageConnection=z.infer<typeof imageConnectionSchema>;
export const portraitStyles=['original','white','sky','gray','natural','editorial','yearbook','yearbook-female','template-male','template-female'] as const;
export const portraitNames=['原照自然','纯白标准','天空蓝职业','浅灰商务','自然商务','编辑肖像','韩式学年照 · 男生','韩式学年照 · 女生','固定模板 · 男生','固定模板 · 女生'];
// 巨型base64（2K图重编码后可达约4M字符）不能用分组量词正则校验：irregexp原生栈随输入增长，深栈下RangeError会带崩进程；改用线性检查。
export function isBase64Text(value:string){
 if(value.length%4)return false;
 let end=value.length;
 while(end>0&&value.charCodeAt(end-1)===61)end--;
 if(value.length-end>2)return false;
 for(let i=0;i<end;i++){const c=value.charCodeAt(i);
  if(!(c>=48&&c<=57||c>=65&&c<=90||c>=97&&c<=122||c===43||c===47))return false;}
 return true;
}
export const imagePayloadSchema=z.object({base64:z.string().min(4).max(20*1024*1024).refine(isBase64Text),mime:z.enum(['image/png','image/jpeg','image/webp'])}).strict();
export const normalizedImageSchema=z.object({base64:imagePayloadSchema.shape.base64,width:z.number().int().positive().max(24000000),height:z.number().int().positive().max(24000000)}).strict().refine(image=>image.width*image.height<=24000000);
export type NormalizedImage=z.infer<typeof normalizedImageSchema>;
export const portraitInputSchema=z.object({connectionId:z.string().uuid(),requestId:z.string().uuid(),documentId:z.string().uuid(),baseRevision:z.number().int().nonnegative(),sourceAssetId:z.string().uuid(),templateDigest:z.string().regex(/^[a-f0-9]{64}$/).optional(),style:z.enum(portraitStyles).exclude(['original']),options:yearbookSchema.pick({presentation:true,outfit:true,hair:true,retouch:true,background:true}),images:z.array(imagePayloadSchema).min(1).max(2)}).strict().refine(input=>!input.style.startsWith('template-')||(input.images.length===2&&!!input.templateDigest),{message:'固定模板编辑必须同时提供本人原照与无文字模板，顺序不可颠倒',path:['images']});
export type PortraitInput=z.infer<typeof portraitInputSchema>;
export const portraitResultSchema=z.object({requestId:z.string().uuid(),documentId:z.string().uuid(),baseRevision:z.number().int().nonnegative(),sourceAssetId:z.string().uuid(),templateDigest:z.string().regex(/^[a-f0-9]{64}$/).optional(),style:z.enum(portraitStyles),image:normalizedImageSchema}).strict();

export const portraitTaskStatusSchema=z.object({task:portraitTaskSummarySchema,result:portraitResultSchema.optional(),template:normalizedImageSchema.optional(),failure:z.object({error:z.string().max(2000),diagnostic:diagnosticSchema}).strict().optional()}).strict();
