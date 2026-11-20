import {diagnosticSchema} from '../../shared/connection-diagnostics.js';
import { sessionSchema } from '../../shared/schemas.js';
export class LocalTextApi {
    private csrf='';
    constructor(private fetcher:typeof fetch=(...args)=>globalThis.fetch(...args)){}
    async session(signal:AbortSignal=AbortSignal.timeout(10000)){
        const response=await this.fetcher('/api/session',{credentials:'same-origin',signal}).catch(()=>{throw new Error('[LOCAL_NETWORK_FAILED] 无法连接本机状态接口，请确认本地服务运行后刷新页面。');});
        if(!response.ok)throw new Error(`[LOCAL_HTTP_${response.status}] 本机状态接口返回HTTP ${response.status}，请刷新页面后重试。`);
        const data:unknown=await response.json().catch(()=>{throw new Error('[LOCAL_RESPONSE_FORMAT] 本机状态接口未返回有效JSON，请确认打开的是本项目服务。');});
        const parsed=sessionSchema.safeParse(data);
        if(!parsed.success)throw new Error('[LOCAL_RESPONSE_FORMAT] 本机连接状态格式不匹配，请刷新页面加载最新版本。');
        this.csrf=parsed.data.csrfToken;return parsed.data;
    }
    async saveAndVerify(kind:'text'|'image'|'mcp',config:{baseUrl:string;apiKey:string;model?:string;proxyCompatibility?:boolean;resultProxyCompatibility?:boolean;provider?:'openai'|'qwen'|'seedream';size?:'1024x1024'|'2048x2048'},requestId:string,multiple=false,signal?:AbortSignal){
        await this.write(`/api/connections/${kind}`,config,'PUT',signal);
        const session=await this.session(signal);
        signal?.throwIfAborted();
        const connection=kind==='text'?session.textConnection:kind==='image'?session.imageConnection:session.mcpConnection;
        if(!connection||connection.baseUrl!==config.baseUrl||('model' in connection&&connection.model!==config.model?.trim())||(kind!=='mcp'&&Boolean('proxyCompatibility' in connection&&connection.proxyCompatibility)!==Boolean(config.proxyCompatibility)))throw new Error('配置目标已变化，未发起验证；请核对当前设置。');
        if(kind==='image'&&((session.imageConnection?.provider??'openai')!==(config.provider??'openai')||(session.imageConnection?.size??'1024x1024')!==(config.size??'1024x1024')||Boolean(session.imageConnection?.resultProxyCompatibility)!==Boolean(config.resultProxyCompatibility)))throw new Error('图片服务、清晰度或下载设置已变化，未发起验证；请核对当前设置。');
        if(kind==='image'&&config.provider==='seedream'){await this.write('/api/connections/image/auth',{connectionId:connection.id,requestId},'POST',signal);return;}
        await this.verifyConnection(kind,connection.id,requestId,multiple,signal);
    }
    async verifyConnection(kind:'text'|'image'|'mcp',connectionId:string,requestId:string,multiple=false,signal?:AbortSignal){
        if(kind!=='mcp')await this.write(`/api/connections/${kind}/network`,{connectionId,requestId},'POST',signal);
        signal?.throwIfAborted();
        return this.write(kind==='mcp'?'/api/mcp/discover':`/api/connections/${kind}/test`,{connectionId,requestId,...(kind==='image'?{multiple}:{})},'POST',signal);
    }
    async write(path:string,body:unknown={},method='POST',signal?:AbortSignal):Promise<unknown>{
        if(!this.csrf)await this.session(signal);
        const response=await this.fetcher(path,{method,credentials:'same-origin',headers:{'Content-Type':'application/json','x-csrf-token':this.csrf},body:JSON.stringify(body),signal}).catch(()=>{throw new Error(signal?.aborted?'[LOCAL_CANCELLED] 本页已取消接收。':'[LOCAL_NETWORK_FAILED] 无法连接本机接口，请检查本地服务。');});
        const data:unknown=await response.json().catch(()=>{throw new Error(`[LOCAL_RESPONSE_FORMAT · 本机HTTP ${response.status}] 本机接口未返回有效JSON。`);});
        if(!response.ok){
            const body=data&&typeof data==='object'?data:null;
            const diagnostic=diagnosticSchema.safeParse(body&&'diagnostic' in body?body.diagnostic:undefined);
            const message=body&&'error' in body&&typeof body.error==='string'?body.error:'请求失败，请刷新连接状态后重试。';
            const stages={dns:'域名解析',network:'网络连接',http:'服务商响应',response:'返回格式',operation:'操作执行',session:'本机会话'};
            const label=diagnostic.success?`${diagnostic.data.code} · ${stages[diagnostic.data.stage]}${diagnostic.data.proxyCompatibility!==undefined?` · VPN兼容${diagnostic.data.proxyCompatibility?'已开启':'未开启'}`:''}${diagnostic.data.causeCode?` · 原因 ${diagnostic.data.causeCode}`:''}${diagnostic.data.targetHost?` · 目标域名 ${diagnostic.data.targetHost}`:''}${diagnostic.data.upstreamStatus?` · 服务商HTTP ${diagnostic.data.upstreamStatus}`:''}`:`LOCAL_HTTP_${response.status}`;
            throw new Error(`[${label} · 本机HTTP ${response.status}] ${message}`);
        }
        return data;
    }
}
