import {highlightRuns,type TextRange} from '../../shared/text-ranges.js';
import {fontCSS,wrapText} from './text-layout.js';
type Measure={font:string;measureText:(value:string)=>{width:number}};
export function wrapHighlighted(text:string,ranges:TextRange[],offset:number,width:number,size:number,weight:number,font:string,ctx:Measure,strongEnd=0){
    const measure=(value:string,at:number)=>styledRuns(value,ranges,offset+at,weight,strongEnd).reduce((sum,run)=>{ctx.font=fontCSS(size,run.weight,font);return sum+ctx.measureText(run.text).width;},0);
    let at=offset;return wrapText(text,width,measure).map(value=>{const line={value,start:at};at+=value.length;return line;});
}

export function styledRuns(text:string,ranges:TextRange[],offset:number,weight:number,strongEnd=0){
    const split=Math.max(0,Math.min(text.length,strongEnd-offset)),parts=split?[{text:text.slice(0,split),offset,weight:Math.max(600,weight)},{text:text.slice(split),offset:offset+split,weight}]:[{text,offset,weight}];
    return parts.flatMap(part=>highlightRuns(part.text,ranges,part.offset).map(run=>({text:run.text,weight:run.bold?Math.max(700,part.weight):part.weight})));
}
