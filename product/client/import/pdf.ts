import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { checkExtracted, IMPORT_LIMITS, type Extracted } from './core.js';
export async function extractPdf(bytes:Uint8Array,resourceBase:string):Promise<Extracted> {
    // HTTP fonts/CMaps must be fetched in the PDF worker; the DOM reader needs document.
    const task=getDocument({verbosity:0,data:bytes.slice(),maxImageSize:24000000,stopAtErrors:true,useWorkerFetch:/^https?:/.test(resourceBase),disableFontFace:true,disableAutoFetch:true,disableRange:true,disableStream:true,
        cMapUrl:`${resourceBase}cmaps/`,cMapPacked:true,standardFontDataUrl:`${resourceBase}standard_fonts/`});
    try {
        const pdf=await task.promise;
        if(pdf.numPages>IMPORT_LIMITS.pages)throw new Error('PDF 超过 30 页，请拆分后导入。');
        const lines:Extracted['lines']=[];let length=0;
        for(let pageNumber=1;pageNumber<=pdf.numPages;pageNumber++){
            const page=await pdf.getPage(pageNumber);const content=await page.getTextContent();let line='';let lastY:number|undefined;
            function addLine(){if(line){lines.push({text:line,ref:`page:${pageNumber}:line:${lines.length+1}`});length+=line.length+1;line='';}}
            for(const item of content.items){if(!('str' in item))continue;
                const y=item.transform[5];if(lastY!==undefined&&Math.abs(y-lastY)>3)addLine();
                line+=item.str;lastY=y;if(item.hasEOL)addLine();
                if(length+line.length>IMPORT_LIMITS.text)throw new Error('原文超过 20000 字符，请拆分文件，不会截断经历。');
            }
            addLine();page.cleanup();
        }
        return checkExtracted(lines);
    } catch(error) {
        if(error instanceof Error&&error.name==='PasswordException')throw new Error('PDF 已加密，请用未加密的原稿。');
        if(error instanceof Error&&error.name==='InvalidPDFException')throw new Error('PDF 损坏或格式不支持。');
        throw error;
    } finally {await task.destroy();}
}
