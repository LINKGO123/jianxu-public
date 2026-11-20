import { useEffect,useRef,useState } from 'react';
import { z } from 'zod';
import { sessionSchema } from '../../shared/schemas.js';
import {ConnectionFeedback,ConnectionKey} from '../ConnectionFeedback.js';
import type { LocalTextApi } from './api.js';
type Session=z.infer<typeof sessionSchema>;
export function TextConnection({api,session,refresh}:{api:LocalTextApi;session:Session|null;refresh:()=>Promise<void>}){
    const key=useRef<HTMLInputElement>(null);const [baseUrl,setBaseUrl]=useState(session?.textConnection?.baseUrl??'https://api.deepseek.com'),[model,setModel]=useState(session?.textConnection?.model??'deepseek-flash'),[keyEdited,setKeyEdited]=useState(false),[busy,setBusy]=useState(false),[message,setMessage]=useState(''),[refreshError,setRefreshError]=useState('');
    const [proxyCompatibility,setProxyCompatibility]=useState(session?.textConnection?.proxyCompatibility??false);
    const [editing,setEditing]=useState(session?.connections.text!=='connected');
    const [provider,setProvider]=useState(baseUrl==='https://api.deepseek.com'&&model==='deepseek-flash'?'deepseek':'custom');
    const controller=useRef<AbortController|null>(null),requestId=useRef('');
    useEffect(()=>()=>{requestId.current='';controller.current?.abort();},[]);
    const dirty=baseUrl!==session?.textConnection?.baseUrl||model!==session?.textConnection?.model||keyEdited||proxyCompatibility!==Boolean(session?.textConnection?.proxyCompatibility);
    async function action(kind:'save'|'test'|'delete'|'network'){
        requestId.current='';controller.current=null;setBusy(true);setMessage('');setRefreshError('');
        try{
            if(kind==='network'){controller.current=new AbortController();setMessage('正在检查网络，不调用模型…');const raw=await api.write('/api/network/check',{service:provider,vpnCompatibility:proxyCompatibility},'POST',controller.current.signal) as {vpnCompatibility:boolean};setMessage(`[NETWORK_VERIFIED] 网络预检查通过，后端VPN兼容${raw.vpnCompatibility?'已开启':'未开启'}。未验证密钥或文字能力，没有调用模型。`);}
            else if(kind==='save'){setModel(model.trim());controller.current=new AbortController();requestId.current=crypto.randomUUID();setMessage('正在检查文字助手，请稍候…');const apiKey=key.current?.value??'';if(key.current)key.current.value='';setKeyEdited(false);await api.saveAndVerify('text',{baseUrl,model:model.trim(),apiKey,proxyCompatibility},requestId.current,false,controller.current.signal);setMessage('[VERIFIED] 文字助手已连接，可以使用。');setEditing(false);}
            else if(kind==='test'){controller.current=new AbortController();requestId.current=crypto.randomUUID();await api.verifyConnection('text',session!.textConnection!.id,requestId.current,false,controller.current.signal);controller.current=null;setMessage('[VERIFIED] 文字助手已连接，可以使用。');setEditing(false);}
            else {await api.write('/api/connections/text',{},'DELETE');setMessage('[DISCONNECTED] 文字助手已断开，密钥已从本机会话清除。');setEditing(true);}
        }catch(e){setMessage(controller.current?.signal.aborted?'本页检测已取消接收；服务可能已受理，不自动重试。':e instanceof Error?e.message:'操作失败。');}
        finally{await refresh().catch(error=>setRefreshError(error instanceof Error?error.message:'读取本机状态失败，请刷新后重试。'));controller.current=null;setBusy(false);}
    }
    const status=busy?'正在检查…':dirty&&session?.textConnection?'设置有修改，请重新连接':({unavailable:'尚未连接',configured:'尚未完成检查',connected:'已连接，可以使用',failed:'连接未成功'} as const)[session?.connections.text??'unavailable'];
    return <section className="assistant-card text-connection" aria-labelledby="text-settings-title">
      <header className="assistant-card-header"><div><h2 id="text-settings-title">文字助手</h2><p>检查简历、梳理重点，与你一起打磨表达。</p></div><span className="connection-status" data-connected={session?.connections.text==='connected'&&!dirty&&!busy}>{status}</span></header>
      <details className="connection-form" open={editing} onToggle={e=>setEditing(e.currentTarget.open)}><summary>{session?.connections.text==='connected'?'更换服务或修改连接':'设置文字助手'}</summary>
      <fieldset disabled={busy}><legend className="settings-sr-only">文字助手连接设置</legend>
        <label>选择你使用的 AI<select value={provider} onChange={e=>{setProvider(e.target.value);setProxyCompatibility(false);setBaseUrl(e.target.value==='deepseek'?'https://api.deepseek.com':'');setModel(e.target.value==='deepseek'?'deepseek-flash':'');}}><option value="deepseek">DeepSeek</option><option value="custom">其他兼容服务（自行填写）</option></select></label>
        <p>检查先确认网络可达，再发送一条短消息验证文字能力；网络失败不会继续计费检测。</p>
        {provider==='deepseek'&&<button disabled={busy} onClick={()=>void action('network')}>只检查网络 · 不需要密钥 · 不计费</button>}
        <ConnectionKey inputRef={key} onChange={()=>setKeyEdited(!!key.current?.value)}/>
        {provider==='deepseek'&&<a className="settings-help-link" href="https://platform.deepseek.com/api_keys" target="_blank" rel="noreferrer">在哪里获取 DeepSeek 密钥 ↗</a>}
        <p className="connection-consent">将连接到：{baseUrl||'请在下方填写服务地址'}。检查会发送一条不含简历的短消息，可能产生少量服务费用。</p>
        <label className="settings-check"><input type="checkbox" checked={proxyCompatibility} onChange={e=>setProxyCompatibility(e.target.checked)}/>使用本机 VPN／代理兼容模式（DeepSeek / OpenAI）</label>
        <p>开着 VPN 却连接失败时可尝试开启；仅支持列出的官方服务，开启即信任本机代理路由。</p>
        <details className="advanced-connection" open={provider==='custom'?true:undefined}><summary>其他服务与高级设置</summary>
          {provider==='custom'&&<><label>服务地址（Base URL）<input type="url" value={baseUrl} maxLength={2048} onChange={e=>setBaseUrl(e.target.value)} autoComplete="off"/></label><label>模型名称<input value={model} maxLength={100} onChange={e=>setModel(e.target.value)} autoComplete="off"/></label></>}
          <details><summary>技术详情与兼容范围</summary><p>当前模型：{model}。服务地址：{baseUrl}。</p><p>开启后信任本机代理的 Fake-IP 路由，仅允许官方域名连接到 198.18.0.0/15 映射地址；仍检查 HTTPS 证书并禁止重定向，其他私网地址不放行。代理未运行时仍可能失败。</p><p>当前使用 Chat Completions JSON 接口；自定义地址由系统追加 /chat/completions。</p></details>
        </details>
        <div className="workspace-actions"><button className="primary-button" onClick={()=>void action('save')}>连接并检查 · 可能计费</button><button disabled={!session?.textConnection||dirty} onClick={()=>void action('test')}>重新检查 · 可能计费</button></div>
      </fieldset></details>
      {session?.connections.text==='connected'&&!dirty&&<p className="connected-service">当前文字服务：{provider==='deepseek'?'DeepSeek':baseUrl} · 已检查文字响应能力</p>}
      {session?.textConnection&&<button className="disconnect-button" disabled={busy} onClick={()=>void action('delete')}>断开文字助手</button>}
      {busy&&controller.current&&!controller.current.signal.aborted&&<button onClick={()=>{const id=requestId.current;controller.current?.abort();if(!id)return;void api.write('/api/ai/text/cancel',{requestId:id}).catch(()=>{if(requestId.current===id)setMessage('本页已停止接收，但尚未确认服务端取消；不要重复检查。');});}}>停止检查</button>}
      <ConnectionFeedback message={message} refreshError={refreshError}/>
    </section>;
}
