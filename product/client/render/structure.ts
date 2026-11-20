import type {ResumeDocument} from '../../shared/schemas.js';
import {ptToPx} from './presentation.js';
export const dateRange=/(?:19|20)\d{2}(?:[./-]\d{1,2})?(?:[./]\d{1,2})?\s*(?:[-—–~～]|至)\s*(?:(?:19|20)\d{2}(?:[./-]\d{1,2})?(?:[./]\d{1,2})?|至今|现在|Present)/i;
export function contentBlocks(section:ResumeDocument['sections'][number]){
    const overrides=new Map(section.formatting?.map(f=>[f.line,f.kind]));let blank=false,cursor=0;
    return section.text.split(/\r?\n/).flatMap((text,line)=>{
        const start=cursor;cursor+=text.length+(section.text.slice(cursor+text.length,cursor+text.length+2)==='\r\n'?2:1);
        if(!text.trim()){blank=true;return [];}
        const value=text.trim();
        // shortcut: only explicit organisation/date and heading markers are inferred; ambiguous lines stay body.
        const inferred=/^(公司介绍|机构介绍|学校介绍)\s*[：:]/.test(value)?'note':value.length<180&&dateRange.test(value)&&/(公司|集团|科技|教育|大学|学院|学校|医院|银行|工作室|研究所|事务所)/.test(value)?'company':/^(项目[一二三四五六七八九十\d]+[：:、]|[一二三四五六七八九十]+[、．]|项目名称[：:])/.test(value)?'project':/^(?:\d+[.、．)]|[•●⚫▪·]|[-–]\s)/.test(value)||/^[\p{Script=Han}][\p{Script=Han}A-Za-z0-9 /（）()·-]{1,24}[：:]/u.test(value)?'bullet':'body';
        const block={text,line,start,kind:overrides.get(line)??inferred,paragraphStart:blank};blank=false;return [block];
    });
}

export function blockGap(blocks:ReturnType<typeof contentBlocks>,index:number,spacing:ResumeDocument['presentation']['spacing']){
    if(index===0)return 0;
    const block=blocks[index],gap=spacing?.groups?.[block.kind]??spacing?.paragraph;
    if(gap!==undefined)return ptToPx(gap);
    return block.kind==='company'?26:block.kind==='project'?16:block.kind==='bullet'?8:block.paragraphStart?12:blocks[index-1].kind==='note'?10:0;
}


// Only offers adjacent lines for review; never rewrites imported text automatically.
export function lineJoinOptions(section:ResumeDocument['sections'][number]){
    const blocks=contentBlocks(section);
    return blocks.flatMap((block,index)=>{
        const next=blocks[index+1];
        if(!next||next.line!==block.line+1||next.kind!=='body'||!['body','bullet'].includes(block.kind))return [];
        const left=block.text.trimEnd(),right=next.text.trimStart();
        if(/[。！？；.!?;]$/.test(left)||dateRange.test(right)||/^(岗位|职位|职务|项目名称|公司名称|任职公司|学校|学历|专业|时间)\s*[:：]/.test(left)||/^[（(]\d+[)）]/.test(right))return [];
        const separator=/[A-Za-z0-9]$/.test(left)&&/^[A-Za-z0-9]/.test(right)?' ':'';
        return [{line:block.line,before:block.text+'\n'+next.text,after:left+separator+right}];
    });
}
export function bulletMarker(text:string){return text.match(/^(\s*(?:\d+[.、．)]|[•●⚫▪·]|[-–]\s)\s*)/)?.[0]??'';}
