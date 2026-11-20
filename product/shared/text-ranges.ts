export type TextRange={start:number;end:number};
export function textBoundaries(text:string){return new Set([0,text.length,...Array.from(new Intl.Segmenter('zh',{granularity:'grapheme'}).segment(text),part=>part.index)]);}
export function changeHighlights(text:string,ranges:TextRange[],start:number,end:number,enabled:boolean):TextRange[]{
    const boundaries=textBoundaries(text);
    if(!boundaries.has(start)||!boundaries.has(end)||end<=start||!text.slice(start,end).trim())throw new Error('请在当前栏目选择完整的非空文字；不要截断 emoji 或组合字符。');
    if(!enabled)return ranges.flatMap(range=>range.end<=start||range.start>=end?[range]:[...(range.start<start?[{start:range.start,end:start}]:[]),...(range.end>end?[{start:end,end:range.end}]:[])]);
    const merged:TextRange[]=[];
    for(const range of [...ranges,{start,end}].sort((a,b)=>a.start-b.start)){const prior=merged.at(-1);if(prior&&range.start<=prior.end)prior.end=Math.max(prior.end,range.end);else merged.push({...range});}
    return merged;
}
export function highlightRuns(text:string,ranges:TextRange[],offset=0){
    const cuts=new Set([0,text.length]);for(const range of ranges){if(range.start>offset&&range.start<offset+text.length)cuts.add(range.start-offset);if(range.end>offset&&range.end<offset+text.length)cuts.add(range.end-offset);}
    const sorted=[...cuts].sort((a,b)=>a-b);
    return sorted.slice(0,-1).map((start,i)=>({text:text.slice(start,sorted[i+1]),bold:ranges.some(range=>range.start<=offset+start&&range.end>offset+start)}));
}
