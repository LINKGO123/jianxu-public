import {waitForFonts} from '../render/fonts.js';
import {pinyin} from 'pinyin-pro';
import Yearbook from '../../shared/yearbook-model.js';
import type {ResumeDocument} from '../../shared/schemas.js';
import {decodePhoto} from '../portrait/decode.js';
import {canvasBlob} from '../portrait/image.js';
export const namePinyin=(text:string)=>pinyin(text,{toneType:'none',type:'array',surname:'head'});
export function cardName(options:ResumeDocument['portrait']['yearbook'],basic:ResumeDocument['basic']){return Yearbook.resolveName(options,basic,namePinyin);}
export async function composeCard(blob:Blob,options:ResumeDocument['portrait']['yearbook'],basic:ResumeDocument['basic'],signal:AbortSignal){
 const error=Yearbook.validate(options,basic,namePinyin);if(error)throw new Error(error);
 const image=await decodePhoto(blob,signal);
 try{await waitForFonts(signal);const canvas=document.createElement('canvas');Yearbook.drawCard(canvas,image,{name:cardName(options,basic),motto:Yearbook.resolveMotto(options),background:options.background});return await canvasBlob(canvas);}
 finally{image.close();}
}
