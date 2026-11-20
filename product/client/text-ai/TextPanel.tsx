import { useEffect,useState,useSyncExternalStore } from 'react';
import { sectionIds,sectionNames,type SectionId } from '../../shared/schemas.js';
import type { DraftSession } from '../draft-session.js';
import type { LocalTextApi } from './api.js';
import {ConnectionFeedback} from '../ConnectionFeedback.js';
import {McpPanel} from '../external/McpPanel.js';
import { TextAssistant } from './assistant.js';
export function TextPanel({draft,api,connection,session=null,refresh=async()=>{},configure}:{draft:DraftSession;api:LocalTextApi;session?:Awaited<ReturnType<LocalTextApi['session']>>|null;refresh?:()=>Promise<void>;connection:{id:string;baseUrl:string;model:string}|null;configure?:()=>void}){
    const [assistant]=useState(()=>new TextAssistant(draft,api));const state=useSyncExternalStore(assistant.subscribe,assistant.getSnapshot,assistant.getSnapshot);
    const [section,setSection]=useState<SectionId[]>(()=>[draft.getSnapshot().document?.sections.find(s=>s.text.trim())?.id??'summary']),[prompt,setPrompt]=useState(''),[consent,setConsent]=useState(false),[useMcp,setUseMcp]=useState(false),[proposal,setProposal]=useState<{name:string;arguments:Record<string,unknown>}|undefined>();
    useEffect(()=>()=>assistant.dispose(),[assistant]);
    useEffect(()=>{setConsent(false);assistant.cancel('连接目标已变化，旧请求不再接收。');},[connection?.id]);
    useEffect(()=>{if(useMcp)assistant.cancel('工具权限或清单已变化，旧提议不再接收。');setUseMcp(false);setConsent(false);setProposal(undefined);},[session?.mcpConnection?.id,session?.mcpConnection?.roundId,JSON.stringify(session?.mcpConnection?.approved)]);
    const chosen=draft.getSnapshot().document?.sections.filter(s=>section.includes(s.id))??[];
    const content=chosen.map(s=>`【${sectionNames[sectionIds.indexOf(s.id)]}】\n${s.text}`).join('\n\n');const total=chosen.reduce((sum,s)=>sum+s.text.length,0);
    const locked=state.running||state.adopting,canRun=!!connection&&consent&&!!chosen.length&&chosen.every(s=>s.text.trim())&&total<=20000&&!locked;
    const connectionStatus=connection?'已连接':session?.connections.text==='failed'?'连接检测失败':session?.connections.text==='configured'?'已配置，尚未通过检测':'未连接';
    return <section className="chat-panel"><h2>诊断与对话建议</h2>
        <p className="connection-status" role="status">文本 AI · {connectionStatus}</p>
        {!connection&&<div className="connection-guide"><p>请先配置文本服务并通过实际检测。本地编辑和下载仍可使用。</p>{configure&&<button onClick={configure}>前往 AI 助手设置</button>}</div>}
        <p className="send-selection"><strong>当前发送栏目：</strong>{chosen.map(s=>sectionNames[sectionIds.indexOf(s.id)]).join('、')||'尚未选择'} · {total}/20000 字符</p>
        <details className="chat-options"><summary>调整发送栏目与核对原文</summary><fieldset disabled={locked}><legend>本次发送栏目</legend>{sectionIds.map((id,i)=><label key={id}><input type="checkbox" checked={section.includes(id)} onChange={e=>{setSection(ids=>e.target.checked?[...ids,id]:ids.filter(value=>value!==id));setConsent(false);}}/>{sectionNames[i]}</label>)}</fieldset><pre>{content||'尚未选择有内容的栏目'}</pre></details>
        <label>对话要求<textarea disabled={locked} value={prompt} maxLength={2000} onChange={e=>{setPrompt(e.target.value);setConsent(false);}}/></label>
        <p className="send-target">目标：{connection?.baseUrl??'未连接'} · 模型：{connection?.model??'未配置'}。</p>
        <p>只发送所选栏目及本次要求，不发送基本资料字段、头像或完整原稿；所选文字自身可能含个人信息。请求可能计费。</p>
        <p>建议须逐条确认；可采纳正文仅限换行和行尾空白整理，表达修改需核对后手工编辑。</p>
        <details className="chat-options"><summary>能力说明与 MCP 高级选项{useMcp?' · 已启用工具提议':''}</summary><p>每栏至多一条格式建议，保留全部行、空行、缩进和顺序；不允许删减、重排或改变经历归属。诊断和问题仅供核实，不自动修改简历。</p><label><input type="checkbox" disabled={locked||!session?.mcpConnection?.approved.length} checked={useMcp} onChange={e=>{setUseMcp(e.target.checked);setConsent(false);}}/>让文本AI提出已允许的MCP工具建议（会发送工具名称、说明与参数结构，不自动调用）</label></details>
        {useMcp&&<p>本次还会发送已允许工具的名称、说明及参数结构；执行工具仍需另行核对授权。</p>}
        <label className="send-consent"><input type="checkbox" disabled={locked||!connection} checked={consent} onChange={e=>setConsent(e.target.checked)}/>允许将以上内容发送到上述服务（可能计费）</label>
        <div className="chat-actions"><button className="primary-button" disabled={!canRun||!prompt.trim()} onClick={()=>{if(connection)void assistant.run('chat',section,prompt,connection.id,useMcp);}}>发送并查看建议</button><button disabled={!canRun} onClick={()=>{if(connection)void assistant.run('diagnose',section,'',connection.id,useMcp);}}>请求所选栏目诊断</button></div>
        {state.running&&<button onClick={()=>assistant.cancel()}>取消请求</button>}<p role="status">{state.status}</p><ConnectionFeedback message={state.error} error/>
        {state.advice&&<div><h3>AI意见 · 待核实</h3><ul>{state.advice.diagnosis.map((text,i)=><li key={i}>{text}</li>)}</ul><h3>需要你补充的问题</h3><ul>{state.advice.questions.map((text,i)=><li key={i}>{text}</li>)}</ul>{state.advice.suggestions.map((change,i)=><article className="suggestion-card" key={i}><h3>{sectionNames[sectionIds.indexOf(change.sectionId)]} · {({pending:'待决定',accepted:'已采纳',rejected:'已拒绝',expired:'已过期'} as const)[state.decisions[i]]}</h3><p>{change.reason}</p><details open><summary>逐条差异</summary><p>修改前</p><pre><del>{change.before}</del></pre><p>修改后</p><pre><ins>{change.after}</ins></pre></details><button disabled={state.adopting||state.decisions[i]!=='pending'} onClick={()=>void assistant.accept(i)}>采纳并保存此条</button><button disabled={state.adopting||state.decisions[i]!=='pending'} onClick={()=>assistant.reject(i)}>拒绝此条</button></article>)}</div>}
        {state.advice?.toolProposals?.map((item,i)=><article key={i}><h3>只读工具提议：{item.name}</h3><p>{item.reason}</p><pre>{JSON.stringify(item.arguments,null,2)}</pre><button disabled={draft.getSnapshot().document?.id!==state.advice?.documentId||draft.getSnapshot().document?.revision!==state.advice?.baseRevision} onClick={()=>setProposal(item)}>核对本次参数与目标</button></article>)}{proposal&&state.advice?.documentId===draft.getSnapshot().document?.id&&state.advice?.baseRevision===draft.getSnapshot().document?.revision&&<McpPanel api={api} session={session} refresh={refresh} proposal={proposal}/>}
        {!!state.turns.length&&<details><summary>本页最近对话（不写入历史或存储）</summary>{state.turns.map((turn,i)=><pre key={i}>{turn}</pre>)}</details>}
    </section>;
}
