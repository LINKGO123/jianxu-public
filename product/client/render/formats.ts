import {sectionIds,type ResumeDocument} from '../../shared/schemas.js';
import type {Assets} from '../portrait/assets.js';
import {decodePhoto} from '../portrait/decode.js';
import {canvasBlob} from '../portrait/image.js';
import {paintPhoto,paintSectionIcon,themes} from './pages.js';
import {presentationValues} from './presentation.js';
import {renderImages} from './browser.js';
import {editableDocx,imagePdf} from './document-files.js';
export type ExportFormat='png'|'pdf'|'docx';
export async function renderExport(doc:ResumeDocument,assets:Assets,signal:AbortSignal,format:ExportFormat):Promise<Blob[]>{
    signal.throwIfAborted();
    if(format==='docx'){
        let photo,icon;const values=presentationValues(doc);
        if(values.photoVisible&&doc.portrait.appliedAssetId){const asset=assets[doc.portrait.appliedAssetId];if(!asset)throw new Error('照片资产缺失，请重新导入。');const bitmap=await decodePhoto(asset.blob,signal);
            try{const shape=asset.kind==='card'?'contain':values.photoShape,canvas=document.createElement('canvas');canvas.height=shape&&shape!=='contain'?Math.round(values.photoSize*3):bitmap.height;canvas.width=shape==='portrait'?Math.round(canvas.height*.75):shape&&shape!=='contain'?canvas.height:bitmap.width;const ctx=canvas.getContext('2d');if(!ctx)throw new Error('当前环境无法处理照片。');paintPhoto(ctx,bitmap,0,0,canvas.width,canvas.height,shape);const blob=await canvasBlob(canvas);photo={bytes:new Uint8Array(await blob.arrayBuffer()),width:canvas.width,height:canvas.height};}finally{bitmap.close();}
        }
        if(values.icons){icon={} as Record<string,Uint8Array>;for(const id of sectionIds){const canvas=document.createElement('canvas');canvas.width=48;canvas.height=48;const ctx=canvas.getContext('2d');if(!ctx)throw new Error('当前环境无法生成标题图标。');paintSectionIcon(ctx,0,0,48,themes[doc.presentation.styleId].accent,id);icon[id]=new Uint8Array(await (await canvasBlob(canvas)).arrayBuffer());}}
        signal.throwIfAborted();return [editableDocx(doc,photo,icon)];
    }
    const result=await renderImages(doc,assets,signal,true);
    if(format==='png')return result.blobs;
    const jpegs:Uint8Array[]=[];
    for(const blob of result.blobs){
        signal.throwIfAborted();const bitmap=await decodePhoto(blob,signal);
        try{const canvas=document.createElement('canvas');canvas.width=bitmap.width;canvas.height=bitmap.height;const ctx=canvas.getContext('2d');if(!ctx)throw new Error('当前环境无法生成PDF。');ctx.drawImage(bitmap,0,0);const jpeg=await new Promise<Blob>((resolve,reject)=>canvas.toBlob(value=>value?resolve(value):reject(new Error('PDF图片编码失败。')),'image/jpeg',.97));jpegs.push(new Uint8Array(await jpeg.arrayBuffer()));}finally{bitmap.close();}
    }
    signal.throwIfAborted();return [imagePdf(jpegs)];
}
