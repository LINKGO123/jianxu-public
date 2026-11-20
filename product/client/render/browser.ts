import { documentSchema,confirmationIssue,type ResumeDocument } from '../../shared/schemas.js';
import type { Assets } from '../portrait/assets.js';
import { decodePhoto } from '../portrait/decode.js';
import { canvasBlob } from '../portrait/image.js';
import {presentationValues} from './presentation.js';
import {waitForFonts} from './fonts.js';
import { planResume,paintPage,PAGE } from './pages.js';
export async function renderImages(document:ResumeDocument,assets:Assets,signal:AbortSignal,fullSize:boolean){
    const doc=documentSchema.parse(document);if(fullSize&&(doc.confirmedRevision!==doc.revision||confirmationIssue(doc)))throw new Error('请先确认当前版本，未生成未经确认的 PNG。');const bitmaps=new Map<string,ImageBitmap>();
    try{
        await waitForFonts(signal);
        if(signal.aborted)throw new Error('已取消图片生成。');
        if(presentationValues(doc).photoVisible&&doc.portrait.appliedAssetId){const asset=assets[doc.portrait.appliedAssetId];if(!asset)throw new Error('照片资产缺失，请重新导入。');bitmaps.set(asset.id,await decodePhoto(asset.blob,signal));}
        const canvas=window.document.createElement('canvas');canvas.width=fullSize?PAGE.outputWidth:1240;canvas.height=fullSize?PAGE.outputHeight:1754;
        const context=canvas.getContext('2d');if(!context)throw new Error('当前环境无法生成图片。');
        const photo=doc.portrait.appliedAssetId?bitmaps.get(doc.portrait.appliedAssetId):undefined;
        const plans=planResume(doc,context,photo?{width:photo.width,height:photo.height,kind:assets[doc.portrait.appliedAssetId!]?.kind}:undefined),blobs:Blob[]=[];
        for(const plan of plans){if(signal.aborted)throw new Error('已取消图片生成。');paintPage(context,plan,bitmaps,canvas.width,canvas.height);blobs.push(await canvasBlob(canvas));}
        return {blobs,plans,revision:doc.revision};
    }finally{for(const bitmap of bitmaps.values())bitmap.close();}
}

export function imageLinks(blobs:Blob[]) {
    const links:string[]=[];
    try{for(const blob of blobs)links.push(URL.createObjectURL(blob));return links;}
    catch(error){links.forEach(url=>URL.revokeObjectURL(url));throw error;}
}
