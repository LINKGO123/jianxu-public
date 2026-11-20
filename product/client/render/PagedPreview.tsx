import {useEffect,useRef,useState,useSyncExternalStore} from 'react';
import type {ResumeDocument} from '../../shared/schemas.js';
import type {Assets} from '../portrait/assets.js';
import {PAGE} from './pages.js';
import {Preview} from '../Preview.js';
import {PreviewSession} from './preview-session.js';
export function PagedPreview({document:doc,assets,active=true,interactive=false,caption}:{document:ResumeDocument;assets:Assets;active?:boolean;interactive?:boolean;caption?:string}){
    const [session]=useState(()=>new PreviewSession()),[retry,setRetry]=useState(0);
    const {urls,document:shown,assets:shownAssets,pending,error}=useSyncExternalStore(session.subscribe,session.getSnapshot,session.getSnapshot);
    const viewport=useRef<HTMLDivElement>(null);
    const [fit,setFit]=useState(true),[width,setWidth]=useState<number>(PAGE.width),[manual,setManual]=useState(1),[selectedPage,setSelectedPage]=useState(0);
    const scale=fit?Math.max(.25,(width-32)/PAGE.width):manual,pageIndex=Math.min(selectedPage,Math.max(0,urls.length-1));
    useEffect(()=>{if(!interactive||!active||!viewport.current)return;const node=viewport.current,observer=new ResizeObserver(()=>setWidth(node.clientWidth));setWidth(node.clientWidth);observer.observe(node);return()=>observer.disconnect();},[interactive,active]);
    const outdated=shown!==doc||shownAssets!==assets,updating=pending||(!error&&outdated);
    const updateStatus=updating?urls.length?'正在更新 · 下方暂为上一版预览':'正在更新 · 正在生成分页图片':error?urls.length?'更新失败 · 下方仍为上一版预览':'尚未生成图片预览':'预览已更新';
    useEffect(()=>{if(active)session.update(doc,assets);return()=>session.cancel();},[session,doc,assets,retry,active]);
    useEffect(()=>{session.presented(urls);},[session,urls]);
    useEffect(()=>()=>session.dispose(),[session]);
    return <section className="paged-preview" aria-label="分页图片预览" aria-busy={updating}>
        {interactive?<header className="preview-heading"><strong>排版预览</strong><span>{caption}</span><p className="preview-update-status" role="status">{updateStatus}</p></header>:<p className="preview-update-status" role="status">{updateStatus}</p>}
        {error&&<div role="alert" className="error-notice">{error}<button onClick={()=>setRetry(value=>value+1)}>重试图片预览</button></div>}
        {interactive&&<div className="preview-controls" aria-label="预览操作"><button aria-pressed={fit} onClick={()=>setFit(true)}>适合宽度</button><button aria-label="缩小预览" disabled={scale<=.25} onClick={()=>{setManual(Math.max(.25,Math.round((scale-.1)*100)/100));setFit(false);}}>−</button><output aria-live="polite">{Math.round(scale*100)}%</output><button aria-label="放大预览" disabled={scale>=2} onClick={()=>{setManual(Math.min(2,Math.round((scale+.1)*100)/100));setFit(false);}}>＋</button><span>缩放只影响屏幕预览</span><button disabled={!pageIndex} onClick={()=>setSelectedPage(pageIndex-1)}>上一页</button><output aria-live="polite">第 {pageIndex+1} / {Math.max(1,urls.length)} 页</output><button disabled={pageIndex>=urls.length-1} onClick={()=>setSelectedPage(pageIndex+1)}>下一页</button></div>}
        <div ref={viewport} className={interactive?'page-viewport':undefined}>
        {!urls.length&&<div className="preview-placeholder" aria-label="简历纸张占位"/>}
        {urls.map((url,i)=><figure key={url} hidden={interactive&&i!==pageIndex} style={interactive?{width:PAGE.width*scale}:undefined}><img src={url} width={1240} height={1754} alt={`${outdated?'上一版':'当前'}简历第 ${i+1} / ${urls.length} 页，最新文字见下方核对版`}/><figcaption>{i+1} / {urls.length}{outdated?' · 上一版预览':''}</figcaption></figure>)}
        </div><details><summary>可访问文字核对版</summary><Preview document={doc}/></details>
    </section>;
}
