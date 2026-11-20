import {z} from 'zod';
import {AjvJsonSchemaValidator} from '@modelcontextprotocol/sdk/validation/ajv';
import type {JsonSchemaType,jsonSchemaValidator} from '@modelcontextprotocol/sdk/validation';
import {UserError} from './external-session.js';
const nodeSchema=z.object({type:z.enum(['object','array','string','number','integer','boolean','null']),title:z.string().max(500).optional(),description:z.string().max(4000).optional(),properties:z.record(z.string(),z.unknown()).optional(),required:z.array(z.string()).max(30).optional(),additionalProperties:z.boolean().optional(),items:z.unknown().optional(),enum:z.array(z.json()).min(1).max(30).optional(),minLength:z.number().int().min(0).max(4000).optional(),maxLength:z.number().int().min(0).max(4000).optional(),minimum:z.number().finite().optional(),maximum:z.number().finite().optional(),minItems:z.number().int().min(0).max(50).optional(),maxItems:z.number().int().min(0).max(50).optional()}).strict();
// First release accepts finite structural schemas, not remote refs, regexes or executable extensions.
export function boundedToolSchema(raw:unknown,depth=0):JsonSchemaType{
 if(depth>4||JSON.stringify(raw).length>16000)throw new UserError('工具参数结构过深或过大。');
 // Zod drops __proto__ record keys; reject before parsing rather than silently accepting a changed schema.
 if(raw&&typeof raw==='object'&&'properties' in raw&&raw.properties&&typeof raw.properties==='object'&&Object.keys(raw.properties).some(name=>['__proto__','constructor','prototype'].includes(name)))throw new UserError('工具参数名不支持。');
 const node=nodeSchema.parse(raw),{properties,items,...rest}=node;
 const schema:JsonSchemaType={...rest};
 if(node.type==='object'){
  const entries=Object.entries(properties??{});if(entries.length>30)throw new UserError('工具参数名或数量不支持。');
  schema.properties=Object.fromEntries(entries.map(([key,value])=>[key,boundedToolSchema(value,depth+1)]));schema.additionalProperties=false;
  if(node.required?.some(name=>!Object.hasOwn(schema.properties!,name)))throw new UserError('工具必填参数定义无效。');
 }else if(properties||node.required)throw new UserError('工具参数定义类型不匹配。');
 if(node.type==='array'){if(!items)throw new UserError('工具数组必须声明元素类型。');schema.items=boundedToolSchema(items,depth+1);schema.maxItems=node.maxItems??50;}
 if(node.type==='string')schema.maxLength=node.maxLength??4000;
 return schema;
}
export const toolValidator:jsonSchemaValidator={getValidator<T>(schema:JsonSchemaType){return new AjvJsonSchemaValidator().getValidator<T>(boundedToolSchema(schema));}};
