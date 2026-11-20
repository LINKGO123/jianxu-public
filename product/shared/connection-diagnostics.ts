import {z} from 'zod';
export const diagnosticSchema=z.object({
 code:z.enum(['AUTH_FAILED','FORBIDDEN','RATE_OR_QUOTA','RATE_LIMITED','QUOTA_EXHAUSTED','CONTENT_REJECTED','IMAGE_DOWNLOAD_FAILED','ENDPOINT_NOT_FOUND','MODEL_NOT_OPEN','REQUEST_REJECTED','UPSTREAM_ERROR','DNS_FAILED','NETWORK_FAILED','TARGET_REJECTED','REDIRECT_REJECTED','RESPONSE_FORMAT','CANCELLED_OR_TIMEOUT','SESSION_EXPIRED','OPERATION_FAILED']),
 stage:z.enum(['dns','network','http','response','operation','session']),
 upstreamStatus:z.number().int().min(100).max(599).optional(),
 causeCode:z.string().regex(/^[A-Z_]+$/).max(64).optional(),
 targetHost:z.string().max(8192).optional(),
 proxyCompatibility:z.boolean().optional(),
}).strict();
export type ConnectionDiagnostic=z.infer<typeof diagnosticSchema>;
export class ConnectionError extends Error{
 constructor(message:string,readonly diagnostic:ConnectionDiagnostic){super(message);}
}
export function httpConnectionError(status:number){
 const code=status===401?'AUTH_FAILED':status===403?'FORBIDDEN':status===429?'RATE_OR_QUOTA':status===404?'ENDPOINT_NOT_FOUND':status>=500?'UPSTREAM_ERROR':'REQUEST_REJECTED';
 const message=status===401?'认证失败，请检查Key。':status===403?'服务拒绝访问，请检查账号、模型权限或地区限制。':status===429?'服务限制请求：可能是限流或配额/余额不足，请核对服务商账单和限额；仅凭429无法区分。':status===404?'接口或模型不存在，请核对Base URL和模型。':status>=500?'上游服务异常，请检查服务商状态。':'服务拒绝当前请求，请检查接口协议和参数。';
 return new ConnectionError(message,{code,stage:'http',upstreamStatus:status});
}
export function connectionDiagnostic(error:unknown,aborted=false,expired=false):ConnectionDiagnostic{
 if(expired)return {code:'SESSION_EXPIRED',stage:'session'};
 if(aborted)return {code:'CANCELLED_OR_TIMEOUT',stage:'operation'};
 if(error instanceof z.ZodError)return {code:'RESPONSE_FORMAT',stage:'response'};
 return error instanceof ConnectionError?error.diagnostic:{code:'OPERATION_FAILED',stage:'operation'};
}
