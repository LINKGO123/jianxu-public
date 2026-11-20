import { useEffect,useRef,useState } from 'react';
import { editDocument,type ResumeDocument } from '../../shared/schemas.js';
import { type Assets,type PortraitAsset } from './assets.js';
import { drawCrop,canvasBlob,assertPhotoFile,type Crop } from './image.js';
import { decodePhoto } from './decode.js';
export function PhotoEditor({document:doc,assets,apply,close,sourcePdf,purpose='portrait',initialImage}:{document:ResumeDocument;assets:Assets;apply:(doc:ResumeDocument,assets:PortraitAsset[],base:number)=>Promise<void>;close:()=>void;sourcePdf?:File;purpose?:'portrait'|'reference';initialImage?:Blob}){
    const dialog=useRef<HTMLDialogElement>(null),canvas=useRef<HTMLCanvasElement>(null),source=useRef<ImageBitmap|null>(null),sourceAsset=useRef<PortraitAsset|null>(null),request=useRef<AbortController|null>(null);
    const base=useRef(doc.revision);const [crop,setCrop]=useState<Crop>((purpose==='portrait'?doc.portrait.crop:null)??{x:0,y:0,zoom:1,rotation:0,ratio:'3:4'});
    const [ready,setReady]=useState(false),[error,setError]=useState(''),[busy,setBusy]=useState(false),[pdfLoading,setPdfLoading]=useState(false);
    const drag=useRef<{x:number;y:number;crop:Crop}|null>(null);
    async function load(blob:Blob,existing?:PortraitAsset){
        if(blob instanceof File){try{assertPhotoFile(blob);}catch(error){setError(error instanceof Error?error.message:'文件类型无效。');return;}}
        request.current?.abort();const controller=new AbortController();request.current=controller;setReady(false);setError('');
        try{const image=await decodePhoto(blob,controller.signal);if(controller.signal.aborted){image.close();return;}source.current?.close();source.current=image;sourceAsset.current=existing??{id:crypto.randomUUID(),parentId:null,kind:'original',blob,width:image.width,height:image.height};if(!existing)setCrop({x:0,y:0,zoom:1,rotation:0,ratio:'3:4'});setReady(true);}catch(e){if(!controller.signal.aborted)setError(e instanceof Error?e.message:'无法打开照片。');}}
    async function loadPdf(file:File){
        request.current?.abort();const controller=new AbortController();request.current=controller;setPdfLoading(true);setError('');
        try{const {renderPdfFirstPage}=await import('../import/pdf-page.js');const blob=await renderPdfFirstPage(file,controller.signal);if(!controller.signal.aborted)await load(blob);}
        catch(error){if(!controller.signal.aborted)setError(error instanceof Error?error.message:'PDF首页读取失败。');}
        finally{setPdfLoading(false);}
    }
    useEffect(()=>{const trigger=window.document.activeElement;dialog.current?.showModal();const original=purpose==='portrait'&&doc.portrait.originalAssetId?assets[doc.portrait.originalAssetId]:null;if(initialImage)void load(initialImage);else if(original)void load(original.blob,original);else if(purpose==='portrait'&&doc.portrait.originalAssetId)setError('原图资产缺失，请重新导入照片。');
        return()=>{request.current?.abort();source.current?.close();dialog.current?.close();if(trigger instanceof HTMLElement&&trigger.isConnected)trigger.focus();};},[]);
    useEffect(()=>{if(ready&&source.current&&canvas.current){try{const normalized=drawCrop(canvas.current,source.current,crop);if(normalized.x!==crop.x||normalized.y!==crop.y)setCrop(normalized);}catch(e){setError(e instanceof Error?e.message:'裁切预览失败，请重新导入。');setReady(false);}}},[ready,crop]);
    async function save(){if(!source.current||!sourceAsset.current)return;setBusy(true);setError('');try{
        const output=window.document.createElement('canvas');output.width=720;output.height=crop.ratio==='1:1'?720:960;
        const normalized=drawCrop(output,source.current,crop),blob=await canvasBlob(output),original=sourceAsset.current;
        const applied:PortraitAsset={id:crypto.randomUUID(),parentId:original.id,kind:'crop',blob,width:output.width,height:output.height};
        const next=editDocument(doc,d=>{d.portrait.originalAssetId=original.id;d.portrait.appliedAssetId=applied.id;d.portrait.crop=normalized;});
        await apply(next,[...(!assets[original.id]?[original]:[]),applied],base.current);close();
    }catch(e){setError(e instanceof Error?e.message:'照片保存失败，当前简历未改变。');}finally{setBusy(false);}}
    return <dialog ref={dialog} className="photo-dialog" aria-labelledby="photo-editor-title" onCancel={e=>{if(busy)e.preventDefault();}} onClose={close}><header className="sample-dialog-top"><h2 id="photo-editor-title">{purpose==='reference'?'裁切风格参考图':'照片里的你，保持真实。'}</h2><button disabled={busy} onClick={()=>dialog.current?.close()} aria-label={purpose==='reference'?'关闭参考图裁切':'关闭照片编辑'}>×</button></header>
        <p>{purpose==='reference'?'裁去截图黑边、字幕和落款，保留服装、头发、背景与光线。只发送你确认的裁切图，不采用参考人物的五官。':'照片或简历页面截图仅在本地裁切；原图与构图一起保存。图片编辑与本地小卡位于预览页的照片工作室。'}</p><label>上传照片 / 页面截图（JPEG、PNG、WebP，≤15 MiB / 2400万像素）<input disabled={busy||pdfLoading} type="file" accept="image/jpeg,image/png,image/webp" onChange={e=>{const file=e.target.files?.[0];if(file)void load(file);e.target.value='';}}/></label>
        {purpose==='portrait'&&<details><summary>从简历PDF首页裁切头像</summary><p>仅在本机读取首页。放大并框选头像后再应用；不自动识别人脸，也不会将整页发送给AI。刷新后可重新选择原PDF。</p>{sourcePdf&&<button disabled={busy||pdfLoading} onClick={()=>void loadPdf(sourcePdf)}>使用刚上传的PDF首页</button>}<label>选择PDF读取首页<input disabled={busy||pdfLoading} type="file" accept=".pdf,application/pdf" onChange={e=>{const file=e.target.files?.[0];if(file)void loadPdf(file);e.target.value='';}}/></label></details>}
        {pdfLoading&&<p role="status">正在本地读取PDF首页…<button onClick={()=>request.current?.abort()}>取消读取首页</button></p>}
        {error&&<p role="alert" className="error-notice">{error}</p>}
        <canvas ref={canvas} width={360} height={crop.ratio==='1:1'?360:480} className="photo-crop-canvas" tabIndex={0} aria-label="照片裁切，拖动或用方向键移动，Shift 加速"
            onPointerDown={e=>{if(!ready||busy)return;canvas.current?.setPointerCapture(e.pointerId);drag.current={x:e.clientX,y:e.clientY,crop};}}
            onPointerMove={e=>{if(!drag.current||!canvas.current)return;const bounds=canvas.current.getBoundingClientRect();setCrop({...drag.current.crop,x:drag.current.crop.x+(e.clientX-drag.current.x)/bounds.width,y:drag.current.crop.y+(e.clientY-drag.current.y)/bounds.height});}}
            onPointerUp={()=>{drag.current=null;}} onPointerCancel={()=>{drag.current=null;}}
            onKeyDown={e=>{if(!ready||busy)return;const delta=e.shiftKey?.05:.01;const directions:Record<string,[number,number]>={ArrowLeft:[-delta,0],ArrowRight:[delta,0],ArrowUp:[0,-delta],ArrowDown:[0,delta]};const movement=directions[e.key];if(movement){e.preventDefault();setCrop(c=>({...c,x:c.x+movement[0],y:c.y+movement[1]}));}}}/>
        <fieldset disabled={!ready||busy||pdfLoading}><label>缩放 {Math.round(crop.zoom*100)}%<input type="range" min={1} max={5} step={.01} value={crop.zoom} onChange={e=>setCrop(c=>({...c,zoom:Number(e.target.value)}))}/></label><div className="workspace-actions"><button onClick={()=>setCrop(c=>({...c,rotation:(c.rotation+90)%360,x:0,y:0}))}>旋转 90°</button><button onClick={()=>setCrop(c=>({...c,x:0,y:0,zoom:1,rotation:0}))}>重置构图</button><label>比例<select value={crop.ratio} onChange={e=>{const ratio=e.target.value==='1:1'?'1:1':'3:4';setCrop(c=>({...c,ratio,x:0,y:0}));}}><option>3:4</option><option>1:1</option></select></label></div><button className="primary-button" onClick={()=>void save()}>{purpose==='reference'?'使用此风格参考裁切':'应用原照裁切'}</button></fieldset>
    </dialog>;
}
