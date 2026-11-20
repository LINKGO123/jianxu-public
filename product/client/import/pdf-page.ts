import {getDocument,PDFWorker} from 'pdfjs-dist/legacy/build/pdf.mjs';
import pdfWorkerUrl from 'pdfjs-dist/legacy/build/pdf.worker.mjs?url';
import {IMPORT_LIMITS,validateFile} from './core.js';
import {canvasBlob} from '../portrait/image.js';

export async function renderPdfFirstPage(file:File,signal:AbortSignal):Promise<Blob>{
    const budget=AbortSignal.any([signal,AbortSignal.timeout(IMPORT_LIMITS.timeout)]);
    budget.throwIfAborted();
    if(file.size===0||file.size>IMPORT_LIMITS.bytes)throw new Error('PDF为空或超过15 MiB。');
    const bytes=new Uint8Array(await file.arrayBuffer());budget.throwIfAborted();
    if(validateFile(bytes,file.name,file.type)!=='pdf')throw new Error('请选择原PDF文件。');
    const port=new Worker(pdfWorkerUrl,{type:'module'}),worker=PDFWorker.create({port});
    const task=getDocument({data:bytes,worker,verbosity:0,maxImageSize:24000000,stopAtErrors:true,disableFontFace:true,disableAutoFetch:true,disableRange:true,disableStream:true,
        cMapUrl:`${location.origin}/vendor/pdfjs/cmaps/`,cMapPacked:true,standardFontDataUrl:`${location.origin}/vendor/pdfjs/standard_fonts/`});
    const abort=()=>{void task.destroy();};budget.addEventListener('abort',abort,{once:true});
    try{
        const pdf=await task.promise;budget.throwIfAborted();
        if(pdf.numPages>IMPORT_LIMITS.pages)throw new Error('PDF超过30页，请拆分后选择。');
        const page=await pdf.getPage(1),base=page.getViewport({scale:1});
        const viewport=page.getViewport({scale:Math.min(2,1600/Math.max(base.width,base.height))});
        if(!Number.isFinite(viewport.width)||!Number.isFinite(viewport.height)||viewport.width<1||viewport.height<1)throw new Error('PDF首页尺寸无效。');
        const canvas=document.createElement('canvas');canvas.width=Math.ceil(viewport.width);canvas.height=Math.ceil(viewport.height);
        const context=canvas.getContext('2d');if(!context)throw new Error('当前环境无法读取PDF首页。');
        await page.render({canvas,canvasContext:context,viewport}).promise;budget.throwIfAborted();
        const blob=await canvasBlob(canvas);budget.throwIfAborted();return blob;
    }finally{budget.removeEventListener('abort',abort);await task.destroy();worker.destroy();port.terminate();}
}
