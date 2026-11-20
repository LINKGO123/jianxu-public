import { extractDocx, validateFile } from './core.js';
import { extractPdf } from './pdf.js';
import { GlobalWorkerOptions } from 'pdfjs-dist/legacy/build/pdf.mjs';
import pdfWorkerUrl from 'pdfjs-dist/legacy/build/pdf.worker.mjs?url';
self.onmessage=async(event:MessageEvent<{bytes:ArrayBuffer;name:string;mime:string}>)=>{
    let pdfWorker:Worker|undefined;
    try {const bytes=new Uint8Array(event.data.bytes);const type=validateFile(bytes,event.data.name,event.data.mime);
        // PDF.js's automatic worker setup expects window; supply a dedicated port from this Worker.
        if(type==='pdf')GlobalWorkerOptions.workerPort=pdfWorker=new Worker(pdfWorkerUrl,{type:'module'});
        const extracted=type==='pdf'?await extractPdf(bytes,`${self.location.origin}/vendor/pdfjs/`):extractDocx(bytes);
        self.postMessage({ok:true,extracted});
    } catch(error){self.postMessage({ok:false,error:error instanceof Error?error.message:'文件解析失败，当前草稿未改变。'});}
    finally{GlobalWorkerOptions.workerPort=null;pdfWorker?.terminate();}
};
