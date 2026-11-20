import {changeHighlights} from '../shared/text-ranges.js';
import {LayoutSettings} from './render/LayoutSettings.js';
import {JobStage} from './JobStage.js';
import Reading from '../shared/reading-model.js';
import {applyImportIntent,type ImportIntent} from './import/intent.js';
import {SourceEvidence,sourceLabel} from './SourceEvidence.js';
import {StructureEditor} from './render/StructureEditor.js';
import { useEffect, useRef, useState, useSyncExternalStore, useReducer } from 'react';
import { emptyDocument, editDocument, styles, styleNames, layouts, layoutNames, sectionIds, sectionNames, type ResumeDocument, type Snapshot } from '../shared/schemas.js';
import { DraftSession } from './draft-session.js';
import { ReadingEditor } from './ReadingEditor.js';
import { StyleGallery } from './StyleGallery.js';
import { DraftStore } from './storage.js';
import { PagedPreview } from './render/PagedPreview.js';
import { ExportPanel } from './render/ExportPanel.js';
import { ImportPanel } from './import/ImportPanel.js';
import { PhotoEditor } from './portrait/PhotoEditor.js';
import { clearWorkspace } from './clear-workspace.js';
import { LocalTextApi } from './text-ai/api.js';
import { TextConnection } from './text-ai/TextConnection.js';
import { TextPanel } from './text-ai/TextPanel.js';
import {ExternalConnections} from './external/Connections.js';
import {PortraitStudio} from './portrait-ai/PortraitStudio.js';
import {stepFromHash,navigateState,workspacePanel,type Panel,type Navigation} from './navigation.js';
export const steps = ['上传简历', '整理内容', '排版与形象', '确认生成'];
const snapshotNames: Record<Snapshot['source'], string> = {manual:'手动保存','before-restore':'恢复前备份','before-import':'导入前备份',import:'文件导入','before-portrait':'照片更新前备份',portrait:'照片/小卡更新',confirm:'确认版本','before-suggestion':'采纳前备份',suggestion:'采纳文本建议'};
const basicFields = [['name', '姓名'], ['englishName', '英文名（可选）'], ['role', '求职方向'], ['location', '城市（可选）'], ['phone', '手机号（可选）'], ['email', '邮箱（可选）']] as const;
export function App() {
    const [api]=useState(()=>new LocalTextApi());
    const [connectionState,setConnectionState]=useState<Awaited<ReturnType<LocalTextApi['session']>>|null>(null);
    async function refreshConnection(){setConnectionState(await api.session());}
    const [draftSession] = useState(() => new DraftSession());
    const {document: doc, history, status, error, busy, assets} = useSyncExternalStore(draftSession.subscribe, draftSession.getSnapshot, draftSession.getSnapshot);
    const [{step,panel},dispatchNavigation]=useReducer(navigateState,{step:stepFromHash(location.hash)??0,panel:'workspace'});
    const inWorkspace=workspacePanel(panel);
    const [cleanupMessage,setCleanupMessage]=useState('');
    const [bootError, setBootError] = useState(''), [bootFailed, setBootFailed] = useState(false);
    const [session, setSession] = useState('正在读取本地连接状态…');
    const [sample, setSample] = useState<typeof styles[number] | null>(null);
    const sampleTrigger = useRef<HTMLButtonElement | null>(null);
    const title = useRef<HTMLHeadingElement>(null);
    const [photoOpen, setPhotoOpen] = useState(false);
    const importIntent=useRef<ImportIntent>({});
    const [originalRole,setOriginalRole]=useState<{value:string;sourceText:string}|null>(null);
    const [sourcePdf,setSourcePdf]=useState<{file:File;sourceText:string}|null>(null);
    const [contentTool,setContentTool]=useState<'preview'|'ai'|'closed'>('preview');
    const [textOpened,setTextOpened]=useState(false);
    const [beautyTab,setBeautyTab]=useState<'style'|'layout'|'photo'>('style');
    const [settingsOpened,setSettingsOpened]=useState(false);
    useEffect(()=>{if(panel==='settings')setSettingsOpened(true);},[panel]);
    const [beautyOpened,setBeautyOpened]=useState(false);
    useEffect(()=>{if(inWorkspace&&step===2)setBeautyOpened(true);},[inWorkspace,step]);
    const [sectionOpen,setSectionOpen]=useState<Record<string,boolean>>({});
    useEffect(()=>setSectionOpen({}),[doc?.id]);
    const [selection,setSelection]=useState<{id:string;start:number;end:number}|null>(null),[highlightFeedback,setHighlightFeedback]=useState<Record<string,string>>({});
    const contentPosition=useRef<{id:string;start:number;end:number;scroll:number}|null>(null);
    useEffect(() => {
        let active = true;
        let opened: DraftStore | undefined;
        DraftStore.open().then(async (db) => { opened = db; const data = await db.load(); if (!active) {
            db.close();
            return;
        } draftSession.attach(db, data.document ?? emptyDocument(), data.history, data.document !== null, data.assets); }).catch(err => { if (active) {
            setBootFailed(true);
            setBootError(err instanceof Error ? err.message : '读取失败');
        } opened?.close(); });
        api.session().then(info=>{if(active){setConnectionState(info);setSession('本地服务可用；文本/图片AI独立配置，MCP须主动发现及授权。');}}).catch(()=>{if(active)setSession('本地服务未连接；本地编辑不受影响。');});
        return () => { active = false; draftSession.dispose(); opened?.close(); };
    }, []);
    useEffect(() => {
        const prevent = (event: BeforeUnloadEvent) => { if (draftSession.unsaved) { event.preventDefault(); event.returnValue = ''; } };
        window.addEventListener('beforeunload', prevent);
        return () => window.removeEventListener('beforeunload', prevent);
    }, [draftSession]);
    useEffect(()=>{const sync=()=>dispatchNavigation({type:'hash',hash:location.hash});window.addEventListener('hashchange',sync);return()=>window.removeEventListener('hashchange',sync);},[]);
    useEffect(()=>{importIntent.current={};},[step,doc?.id]);
    useEffect(() => { if (doc)
        title.current?.focus(); }, [step, panel, !!doc]);
    function change(update: (draft: ResumeDocument) => void) { draftSession.edit(update); }
    function navigate(index:number,styles=false){dispatchNavigation({type:'step',step:index,styles});location.hash=`step-${index+1}`;if(styles){setBeautyTab('style');requestAnimationFrame(()=>document.getElementById('style-section')?.scrollIntoView());}}
    useEffect(()=>{
        if(!inWorkspace||step!==1||!doc)return;
        const frame=requestAnimationFrame(()=>{
            const position=contentPosition.current,node=position?document.getElementById(position.id):null;
            const group=node?.closest('details.section-editor');if(group instanceof HTMLDetailsElement)group.open=true;
            const target=node??document.getElementById('content-editor');
            target?.focus({preventScroll:true});if(position)target?.scrollIntoView({block:node?'center':'start'});
            if(node instanceof HTMLTextAreaElement&&position){node.setSelectionRange(position.start,position.end);node.scrollTop=position.scroll;}
        });return()=>cancelAnimationFrame(frame);
    },[inWorkspace,step,!!doc]);
    function rememberContent(node:HTMLTextAreaElement){contentPosition.current={id:node.id,start:node.selectionStart,end:node.selectionEnd,scroll:node.scrollTop};setSelection({id:node.id,start:node.selectionStart,end:node.selectionEnd});}
    function highlight(id:string,enabled:boolean){
        if(!doc||selection?.id!==`content-${id}`)return;
        const section=doc.sections.find(s=>s.id===id)!;
        try{const ranges=changeHighlights(section.text,section.highlights??[],selection.start,selection.end,enabled),previous=section.highlights??[];
            if(ranges.length!==previous.length||ranges.some((r,i)=>r.start!==previous[i].start||r.end!==previous[i].end))change(d=>{const target=d.sections.find(s=>s.id===id)!;if(ranges.length)target.highlights=ranges;else delete target.highlights;});
            setHighlightFeedback(messages=>({...messages,[id]:enabled?'所选文字已加粗重点；正文和来源未改变。':'仅取消了所选范围的重点，其他标记保留。'}));
        }catch(error){setHighlightFeedback(messages=>({...messages,[id]:error instanceof Error?error.message:'重点未保存，请重新选择。'}));}
    }
    async function save(action: 'snapshot' | 'restore', target?: Snapshot) {
        const previous=draftSession.getSnapshot().document;
        await draftSession.save(action,target);
        if(action==='restore'&&draftSession.getSnapshot().document!==previous)importIntent.current={};
    }
    const heading = panel === 'history' ? '历史记录' : panel === 'settings' ? 'AI 助手设置' : panel === 'guide' ? '使用流程' : steps[step];
    return <><a className="skip-link" href="#main-content">跳到主要内容</a>
    <WorkbenchHeader navigation={{step,panel}} name={doc?.basic.name||'新的简历'} status={status} historyCount={history.length} onStep={navigate} onPanel={panel=>dispatchNavigation({type:'panel',panel})}/>
    <main id="main-content" className={inWorkspace&&(step===1||step===2)?"workspace-main":undefined}><div className="page-intro"><div><h1 ref={title} tabIndex={-1}>{heading}</h1><p>{panel==='settings'?'文字助手检查内容，照片助手制作头像，两者均可选。':panel==='history'?'保存或恢复你认可的版本。':panel==='guide'?'从上传到下载，按需使用 AI。':['导入已有简历，或继续填写。无需连接 AI。','核对事实、整理重点，按需查看预览或 AI 建议。','选择风格、排版和照片；随时可返回修改内容。','核对当前版本，再生成 PNG、PDF 或 Word。'][step]}</p></div>{!inWorkspace&&<button onClick={()=>dispatchNavigation({type:'panel',panel:'workspace'})}>返回工作台</button>}</div>
      {(error || bootError) && <div className="error-notice" role="alert">{error || bootError}{doc && draftSession.hasStore && <button disabled={busy} onClick={() => void draftSession.save()}>重试保存</button>}</div>}
      {bootFailed && !doc && <section className="section-card"><h2>尚未打开草稿</h2><p>为保护原数据，不自动覆盖读取失败的草稿。</p><button onClick={() => location.reload()}>重新读取</button><button onClick={() => {setBootError(''); draftSession.attach(null, emptyDocument(), [], false);}}>仅在本页编辑</button></section>}
      {!doc && !bootFailed && <p role="status">正在打开工作台…</p>}
      {doc && <>
        <div className="workspace-pages">

          {inWorkspace && step === 0 && <><div className="upload-layout"><section className="section-card import-card"><ImportPanel document={doc} busy={busy} continueEditing={()=>navigate(1)} apply={async(replacement,base)=>{const intent=importIntent.current,next=applyImportIntent(replacement,intent);await draftSession.apply(next,'import',base);setOriginalRole(intent.role!==undefined&&intent.role!==replacement.basic.role?{value:replacement.basic.role,sourceText:replacement.sourceText}:null);importIntent.current={};}} imported={(file,sourceText)=>setSourcePdf(file.name.toLowerCase().endsWith('.pdf')?{file,sourceText}:null)}/></section><aside className="section-card job-target"><h2>求职目标（可选）</h2><p>不确定可先跳过，稍后仍能修改。</p><label>目标岗位（可选）<input maxLength={200} value={doc.basic.role} onChange={e=>{const role=e.target.value;importIntent.current.role=role;change(d=>{d.basic.role=role;});}} disabled={busy}/></label><JobStage value={doc.presentation.reading.profile} disabled={busy} change={profile=>{importIntent.current.profile=profile;change(d=>{d.presentation.reading=Reading.preset(profile??'',d.presentation.reading);});}}/><p>本次明确填写或选择的目标会保留到导入初稿，不会发送给 AI。</p></aside></div>
          </>}
          <section className="workflow-step content-workspace" hidden={!inWorkspace||step!==1} aria-label="整理内容工作区"><div className="workspace-actions" aria-label="内容辅助工具"><button aria-pressed={contentTool==='preview'} onClick={()=>setContentTool('preview')}>分页预览</button><button aria-pressed={contentTool==='ai'} onClick={()=>{setTextOpened(true);setContentTool('ai');}}>文字 AI</button><button aria-pressed={contentTool==='closed'} onClick={()=>setContentTool('closed')}>收起右侧</button><button className="primary-button" onClick={()=>navigate(2)}>去排版美化 →</button></div><div className={`review-layout content-review ${contentTool==='closed'?'tools-closed':''}`}><div className="content-editor-column"><ReadingEditor document={doc} change={change} disabled={busy} compact/><fieldset id="content-editor" tabIndex={-1} className="review-form-card" disabled={busy}><legend>简历内容 · 修改同步预览</legend><div className="field-grid">{basicFields.map(([key, label]) => <label key={key}>{label}<input value={doc.basic[key]} maxLength={200} type={key === 'email' ? 'email' : 'text'} autoComplete="off" onChange={e => change(d => { d.basic[key] = e.target.value; })}/></label>)}</div>{originalRole&&originalRole.sourceText===doc.sourceText&&<div className="import-role-notice" role="status"><p>已保留本次选择的岗位；原稿方向：{originalRole.value||'未填写'}。请核对是否需要改回。</p><button type="button" onClick={()=>{change(d=>{d.basic.role=originalRole.value;});setOriginalRole(null);}}>改回原稿方向</button></div>}<div className="contact-options">{(['showPhone', 'showEmail'] as const).map((key, i) => <label key={key}><input type="checkbox" checked={doc.basic[key]} onChange={e => change(d => { d.basic[key] = e.target.checked; })}/>{i === 0 ? '在预览中显示手机号' : '在预览中显示邮箱'}</label>)}</div>{doc.basic.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(doc.basic.email) && <p className="field-warning">请核对邮箱格式；系统不会猜测或补填。</p>}
            {doc.sections.map(s => <details key={s.id} className="section-editor" open={sectionOpen[s.id]??!!s.text.trim()} onToggle={e=>{const open=e.currentTarget.open;setSectionOpen(current=>current[s.id]===open?current:{...current,[s.id]:open});}}><summary><span>{sectionNames[sectionIds.indexOf(s.id)]}</span><small>{s.text.trim()?`${s.text.length} 字符`:'未填写 · 点击填写'}{doc.presentation.reading.hidden.some(id=>id===s.id)?' · 预览已隐藏':''}</small></summary><label className={`section-field ${doc.presentation.reading.hidden.some(id => id === s.id) ? 'reading-form-hidden' : ''}`}>{sectionNames[sectionIds.indexOf(s.id)]}{doc.presentation.reading.hidden.some(id => id === s.id) && <small>已从简历预览中隐藏；此处内容仍会保留并可编辑。</small>}<textarea id={`content-${s.id}`} onFocus={e=>rememberContent(e.currentTarget)} onSelect={e=>rememberContent(e.currentTarget)} onBlur={e=>rememberContent(e.currentTarget)} value={s.text} rows={s.id === 'work' ? 6 : 3} maxLength={20000} onChange={e => {if(s.highlights?.length)setHighlightFeedback(messages=>({...messages,[s.id]:'正文已改变，本栏目手工重点已清除；其他栏目保留。'}));change(d => { const section = d.sections.find(item => item.id === s.id); if (section)
                    section.text = e.target.value; });}}/></label><div className="highlight-actions"><button disabled={busy||selection?.id!==`content-${s.id}`||selection.start===selection.end} onMouseDown={e=>e.preventDefault()} onClick={()=>highlight(s.id,true)}>加粗重点 · {sectionNames[sectionIds.indexOf(s.id)]}</button><button disabled={busy||selection?.id!==`content-${s.id}`||selection.start===selection.end} onMouseDown={e=>e.preventDefault()} onClick={()=>highlight(s.id,false)}>取消重点 · {sectionNames[sectionIds.indexOf(s.id)]}</button><small>{s.highlights?.length??0} 处手工重点；正文编辑后清本栏</small><p role="status">{highlightFeedback[s.id]}</p></div><SourceEvidence refs={s.sourceRefs} document={doc}/><StructureEditor section={s} change={change}/></details>)}<details><summary>原文与待核对项</summary><p>{doc.sourceText ? '下方保留已提取原文及位置；请结合遗漏提示，对照原稿逐项核对后再确认。' : '当前为手工录入，尚无文件解析原文。'}</p>{doc.sourceText && (doc.sourceLocations?.length?<div>{doc.sourceLocations.map(location=><div key={location.ref}><strong>{sourceLabel(location.ref)}</strong><code>{location.ref}</code><pre>{doc.sourceText.slice(location.start,location.end)}</pre></div>)}</div>:<pre>{doc.sourceText}</pre>)}{doc.uncertainties.map((item, i) => <label key={i}>待核对项 {i+1}<textarea value={item} onChange={e=>change(d=>{d.uncertainties[i]=e.target.value;})}/></label>)}</details></fieldset></div><aside className="content-side" hidden={contentTool==='closed'}><div className="content-tool" hidden={contentTool!=='preview'}><h2 className="aside-title">实时分页预览</h2><PagedPreview document={doc} assets={assets} active={inWorkspace&&step===1&&contentTool==='preview'}/></div><div className="content-tool" hidden={contentTool!=='ai'}>{textOpened&&<TextPanel configure={()=>dispatchNavigation({type:'panel',panel:'settings'})} draft={draftSession} api={api} session={connectionState} refresh={refreshConnection} connection={connectionState?.connections.text==='connected'?connectionState.textConnection??null:null}/>}</div></aside></div></section>
          {(beautyOpened||inWorkspace&&step===2)&&<section className="workflow-step" hidden={!inWorkspace||step!==2} aria-label="排版与形象工作区"><div className="workspace-actions"><button onClick={()=>navigate(1)}>修改内容</button><button disabled={busy} onClick={()=>save('snapshot')}>保存当前版本</button><button className="primary-button" onClick={()=>navigate(3)}>检查并生成 →</button></div><div className="beauty-workspace"><section className="preview-panel" aria-label="排版预览"><PagedPreview document={doc} assets={assets} active={inWorkspace&&step===2} interactive caption={`${styleNames[styles.indexOf(doc.presentation.styleId)]} · ${layoutNames[layouts.indexOf(doc.presentation.layoutId)]}`}/></section><aside className="beauty-options"><nav className="workspace-actions" aria-label="美化配置"><button aria-pressed={beautyTab==='style'} onClick={()=>setBeautyTab('style')}>风格</button><button aria-pressed={beautyTab==='layout'} onClick={()=>setBeautyTab('layout')}>排版</button><button aria-pressed={beautyTab==='photo'} onClick={()=>setBeautyTab('photo')}>照片</button></nav><div className="beauty-config" hidden={beautyTab!=='style'}>            <StyleGallery selected={doc.presentation.styleId} disabled={busy} select={id => change(d => {d.presentation.styleId = id;})} openSample={(id, trigger) => {sampleTrigger.current = trigger; setSample(id);}}/>
</div><div className="beauty-config" hidden={beautyTab!=='layout'}>            <section className="layout-section" aria-labelledby="layout-title"><h2 id="layout-title">先确定信息怎么排</h2><p>切换保留内容；PNG 与 PDF 沿用预览分页；Word 为可编辑阅读版。</p><button disabled={busy} onClick={() => change(d => { d.presentation.layoutId='single';d.presentation.density='comfortable'; })}>使用单栏阅读版（推荐长履历）</button><div className="layout-grid">{layouts.map((id, i) => <button key={id} aria-pressed={doc.presentation.layoutId === id} onClick={() => change(d => { d.presentation.layoutId = id; })}><span className={`layout-sketch ${id}`} aria-hidden="true"><i /><i /><i /></span>{layoutNames[i]}</button>)}</div></section>
            <label>排版密度<select disabled={busy} value={doc.presentation.spacing?'custom':doc.presentation.density} onChange={e=>change(d=>{d.presentation.density=e.target.value==='compact'?'compact':'comfortable';delete d.presentation.spacing;})}><option value="custom" disabled>自定义间距</option><option value="comfortable">舒展 · 保留更多留白</option><option value="compact">紧凑 · 收紧正文间距</option></select></label><p className="field-hint">公司、项目、条目自动分级；可在内容核对中调整分组。长履历建议单栏，不为固定页数压缩文字。</p>
<LayoutSettings assets={assets} document={doc} change={change} disabled={busy} editSection={id=>{contentPosition.current={id:`content-${id}`,start:0,end:0,scroll:0};navigate(1);}}/></div><div className="beauty-config" hidden={beautyTab!=='photo'}><section className="portrait-current"><h2>当前照片</h2><p>先上传并裁切原照，也可保留已有照片。</p><button disabled={busy} onClick={()=>setPhotoOpen(true)}>上传 / 裁切照片</button>{doc.portrait.appliedAssetId&&<button disabled={busy} onClick={()=>change(d=>{d.portrait.originalAssetId=null;d.portrait.appliedAssetId=null;d.portrait.crop=null;})}>不使用照片</button>}</section><PortraitStudio draft={draftSession} api={api} session={connectionState} refresh={refreshConnection} configure={()=>dispatchNavigation({type:'panel',panel:'settings'})}/></div></aside></div></section>}
          {inWorkspace && step === 3 && <div className="finish-layout"><section className="finish-summary"><h2>确认并下载</h2><p>姓名：{doc.basic.name || '未填写'}</p><p>求职方向：{doc.basic.role || '未填写'}</p><p>版本：{doc.revision} · 照片：{doc.portrait.appliedAssetId ? ({original:'原照',crop:'原照裁切',ai:'已确认AI候选',card:'本地排版小卡',template:'造型模板'} as const)[assets[doc.portrait.appliedAssetId]?.kind??'crop'] : '未使用'}</p><p>姓名、日期、联系方式和成果数字以你的核对为准，不自动补造事实。</p><ExportPanel document={doc} assets={assets} busy={busy} confirm={()=>draftSession.save('confirm')}/><button disabled={busy} onClick={() => save('snapshot')}>先保存当前版本</button></section><PagedPreview document={doc} assets={assets}/></div>}
          <div className="bottom-action" hidden={!inWorkspace}><button disabled={step === 0} onClick={() => navigate(step - 1)}>← 返回上一步</button><span>仅保存在当前浏览器 · {doc.revision} 次修改</span>{step<2&&<button className="primary-button" onClick={() => navigate(step + 1)}>{['开始核对','去排版美化'][step]} →</button>}</div>
        </div>
        {panel === 'history' && <section className="section-card"><h2>当前浏览器的版本</h2><p>最多 40 条。恢复前会先保存当前版本；保存失败时不会替换。</p><button disabled={busy} onClick={() => save('snapshot')}>保存当前版本</button>{cleanupMessage&&<p role="status">{cleanupMessage}</p>}{!history.length && <p>还没有历史版本。</p>}<HistoryVersions document={doc} history={history} busy={busy} restore={item=>void save('restore',item)} remove={item=>{if(window.confirm('删除这条历史版本？仍被其他版本引用的照片会保留。'))void draftSession.save('delete',item);}}/><details className="danger-zone"><summary>危险操作：清除全部本地数据</summary><p>会清除当前简历、全部历史、照片及本机会话连接凭据，并取消在途任务；不是只清历史，无法撤销。</p><button disabled={busy} onClick={()=>{if(window.confirm('清除当前浏览器的简历、历史、照片及本机会话全部连接凭据，并取消在途任务？此操作无法撤销。'))void clearWorkspace(draftSession,api).then(result=>{if(result.credentialsCleared){setSettingsOpened(false);setTextOpened(false);setBeautyOpened(false);setConnectionState(null);setSession('本机会话全部连接凭据已清除。');setCleanupMessage('本机会话全部连接凭据已清除；简历数据清理结果见顶部状态。');}else {setSession('本机凭据清除未确认，请断开或重启服务。');setCleanupMessage('本机会话凭据清除未确认，请在设置中断开或重启本机服务。');}});}}>清除全部本地数据</button></details></section>}
        {(settingsOpened||panel==='settings') && <section hidden={panel!=='settings'} className="assistant-settings" aria-label="AI 助手设置"><div className="settings-welcome"><p>不连接也能上传、编辑、裁切、预览和下载简历。密钥仅暂存在本机服务内存，关闭本地服务后需重新填写。</p><details><summary>查看本机服务状态</summary><p role="status">{session}</p></details></div><TextConnection api={api} session={connectionState} refresh={refreshConnection}/><ExternalConnections api={api} session={connectionState} refresh={refreshConnection}/></section>}
        {panel === 'guide' && <section className="section-card"><h2>本地工作台使用流程</h2><ol><li>上传 PDF/DOCX，解析后进入整理内容，无需先选模板。</li><li>对照原文核对经历、分类和阅读重点，按需切换实际分页预览与文字 AI。</li><li>进入排版与形象选择风格、排版、密度及照片；修改内容可返回原栏目。</li><li>核对并确认当前版本后，下载 PNG、PDF 或 Word；历史支持备份、恢复及删除。</li></ol><p>返回上一步不会清空内容。可以本地导入、裁切照片、预览、确认并下载 PNG、PDF 或 Word；PDF为图片型，文字不可选择；Word字体与分页可能不同。文本 AI 须先配置并实际检测，建议逐条采纳；图片AI须检测编辑能力，MCP默认关闭并逐项授权；原照小卡可离线生成。</p></section>}
      </>}
    </main>
    {photoOpen && doc && <PhotoEditor document={doc} assets={assets} sourcePdf={sourcePdf?.sourceText===doc.sourceText?sourcePdf.file:undefined} close={()=>setPhotoOpen(false)} apply={(replacement,newAssets,base)=>draftSession.apply(replacement,'portrait',base,newAssets)}/>}
    {sample && <SampleDialog styleId={sample} trigger={sampleTrigger.current} close={() => setSample(null)}/>}
  </>;
}

export function SampleDialog({styleId, trigger, close}: {styleId: typeof styles[number]; trigger: HTMLButtonElement | null; close: () => void}) {
    const dialog = useRef<HTMLDialogElement>(null);
    useEffect(() => {
        const node = dialog.current;
        node?.showModal();
        return () => { node?.close(); if (trigger?.isConnected) trigger.focus(); };
    }, [trigger]);
    return <dialog ref={dialog} className="sample-dialog" aria-labelledby="sample-dialog-title" onClose={close} onClick={event => {
        const rect = event.currentTarget.getBoundingClientRect();
        if (event.target === event.currentTarget && (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom)) event.currentTarget.close();
    }}><div className="sample-dialog-top"><h2 id="sample-dialog-title">{styleNames[styles.indexOf(styleId)]} · 风格高清参考</h2><button autoFocus onClick={() => dialog.current?.close()} aria-label="关闭示例">×</button></div><img src={`/examples/${styleId}.png`} alt="完整简历风格参考"/></dialog>;
}

export function WorkbenchHeader({navigation:{step,panel},name,status,historyCount,onStep,onPanel}:{navigation:Navigation;name:string;status:string;historyCount:number;onStep:(index:number,styles?:boolean)=>void;onPanel:(panel:Panel)=>void}){
    const inWorkspace=workspacePanel(panel);
    return <>    <header className="global-nav"><a className="global-brand" href="/"><span className="jianxu-wordmark" data-logo="editorial"><b>简序</b></span></a><nav aria-label="主要导航">{[['workspace', '工作台'], ['styles', '排版与风格'], ['history', '历史记录'], ['guide', '使用流程'], ['settings', 'AI 助手设置']].map(([id, label]) => <button key={id} aria-current={panel === id ? 'page' : undefined} onClick={() => { if (id === 'styles') {
        onStep(2,true);
    }
    else
        onPanel(id as Panel); }}>{label}{id === 'history' ? ` (${historyCount})` : ''}</button>)}</nav><span className="local-pill">本地工作台</span></header>
    <div className="workflow-bar"><div className="workflow-project"><strong>{name}</strong><small role="status" aria-live="polite">{status}</small></div><nav className="step-nav" aria-label="制作进度">{steps.map((label, i) => <button key={label} className={`step-link ${inWorkspace && step === i ? 'active' : ''}`} aria-current={inWorkspace && step === i ? 'step' : undefined} onClick={() => onStep(i)}><span className="step-number">0{i + 1}</span><strong>{label}</strong></button>)}</nav></div>
</>;
}

export function HistoryVersions({document:doc,history,busy,restore,remove}:{document:ResumeDocument;history:Snapshot[];busy:boolean;restore:(item:Snapshot)=>void;remove:(item:Snapshot)=>void}){
    return <>{history.map(item=><article className="history-item" key={item.id}>
        <div className="history-description"><h3>{item.document.basic.name||'姓名未填写'} · {item.document.basic.role||'求职方向未填写'}</h3>
            <strong>{snapshotNames[item.source]} · 第 {item.document.revision} 版</strong>
            {item.document.id===doc.id&&item.document.revision===doc.revision&&<span className="history-current">与当前稿件同一修订</span>}
            <p>{new Date(item.createdAt).toLocaleString('zh-CN')} · {styleNames[styles.indexOf(item.document.presentation.styleId)]} / {layoutNames[layouts.indexOf(item.document.presentation.layoutId)]}</p>
        </div>
        <div className="history-actions"><button disabled={busy} onClick={()=>restore(item)}>恢复（先备份当前）</button><button disabled={busy} onClick={()=>remove(item)}>删除版本</button></div>
    </article>)}</>;
}
