import { Unzip, UnzipInflate } from 'fflate';
import { SaxesParser, type SaxesTagNS } from 'saxes';
import { documentSchema, emptyDocument, sectionIds, type ResumeDocument, type SectionId } from '../../shared/schemas.js';
export const IMPORT_LIMITS = { bytes:15*1024*1024, pages:30, entries:2000, inflated:50*1024*1024, text:20000, timeout:20000 } as const;
export type Extracted = {text:string;lines:{text:string;ref:string}[];warnings?:string[]};
export function validateFile(bytes:Uint8Array,name:string,mime:string) {
    if(!bytes.length||bytes.length>IMPORT_LIMITS.bytes)throw new Error('文件为空或超过 15 MiB。');
    const pdf=name.toLowerCase().endsWith('.pdf'),docx=name.toLowerCase().endsWith('.docx');
    if(pdf&&(!mime||mime==='application/pdf')&&new TextDecoder().decode(bytes.subarray(0,5))==='%PDF-')return 'pdf';
    if(docx&&(!mime||mime==='application/vnd.openxmlformats-officedocument.wordprocessingml.document')&&bytes[0]===80&&bytes[1]===75&&bytes[2]===3&&bytes[3]===4)return 'docx';
    throw new Error('文件扩展名、类型或签名不匹配；仅支持文本型 PDF / DOCX。');
}
export function zipDirectory(bytes:Uint8Array) {
    const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
    let end=-1;
    for(let i=bytes.length-22;i>=Math.max(0,bytes.length-65557);i--)if(view.getUint32(i,true)===0x06054b50&&i+22+view.getUint16(i+20,true)===bytes.length){end=i;break;}
    if(end<0)throw new Error('DOCX 压缩目录损坏。');
    const count=view.getUint16(end+10,true),size=view.getUint32(end+12,true),offset=view.getUint32(end+16,true);
    if(view.getUint16(end+4,true)||view.getUint16(end+6,true)||view.getUint16(end+8,true)!==count||count>IMPORT_LIMITS.entries||offset+size!==end)throw new Error('不支持多卷/ZIP64 或条目过多的 DOCX。');
    const names=new Map<string,{size:number;crc:number}>();let at=offset,total=0;
    for(let i=0;i<count;i++){
        if(at+46>end||view.getUint32(at,true)!==0x02014b50)throw new Error('DOCX 目录条目损坏。');
        const flags=view.getUint16(at+8,true),method=view.getUint16(at+10,true),packed=view.getUint32(at+20,true),unpacked=view.getUint32(at+24,true),len=view.getUint16(at+28,true),extra=view.getUint16(at+30,true),comment=view.getUint16(at+32,true),local=view.getUint32(at+42,true);
        if(at+46+len+extra+comment>end||local+30>offset)throw new Error('DOCX 条目越界。');
        const name=new TextDecoder('utf-8',{fatal:true}).decode(bytes.subarray(at+46,at+46+len));
        if(!name||names.has(name)||name.includes('\\')||name.startsWith('/')||name.split('/').some(p=>p==='..'||p==='.')||/[\x00-\x1f:]/.test(name)||/\.(zip|docx|docm|exe|bin|js|vbs)$/i.test(name))throw new Error('DOCX 包含不允许的路径、嵌套压缩或可执行内容。');
        if(flags&1||![0,8].includes(method)||unpacked===0xffffffff||packed===0xffffffff||view.getUint32(local,true)!==0x04034b50||view.getUint16(local+6,true)!==flags||view.getUint16(local+8,true)!==method)throw new Error('DOCX 条目加密或格式不支持。');
        const localLen=view.getUint16(local+26,true),localExtra=view.getUint16(local+28,true);
        if(new TextDecoder().decode(bytes.subarray(local+30,local+30+localLen))!==name||local+30+localLen+localExtra+packed>offset)throw new Error('DOCX 本地条目与目录不一致。');
        total+=unpacked;if(total>IMPORT_LIMITS.inflated)throw new Error('DOCX 解压体积超过 50 MiB。');
        names.set(name,{size:unpacked,crc:view.getUint32(at+16,true)});at+=46+len+extra+comment;
    }
    if(at!==end||!names.has('[Content_Types].xml')||!names.has('word/document.xml'))throw new Error('不是有效的 DOCX 文档。');
    return names;
}
const crcTable=Uint32Array.from({length:256},(_,value)=>{let crc=value;for(let i=0;i<8;i++)crc=crc&1?0xedb88320^(crc>>>1):crc>>>1;return crc>>>0;});
export function extractDocx(bytes:Uint8Array):Extracted {
    const directory=zipDirectory(bytes),xml=new Map<string,string>();let total=0,failure:Error|undefined;const seen=new Set<string>();
    const unzip=new Unzip(file=>{
        if(!directory.has(file.name)||seen.has(file.name)){failure=new Error('DOCX 流条目与目录不一致。');file.terminate();return;}
        seen.add(file.name);let crc=0xffffffff;let entryTotal=0;const chunks:Uint8Array[]=[];
        file.ondata=(error,data,final)=>{
            if(failure)return;
            if(error){failure=new Error('DOCX 解压失败。');return;}
            total+=data.length;entryTotal+=data.length;
            if(total>IMPORT_LIMITS.inflated||entryTotal>(directory.get(file.name)?.size??0)){failure=new Error('DOCX 实际解压体积超出限制或声明。');file.terminate();return;}
            for(const byte of data)crc=(crc>>>8)^crcTable[(crc^byte)&255];
            const needed=file.name.endsWith('.xml')||file.name.endsWith('.rels');
            if(needed)chunks.push(data.slice());
            if(final){if(entryTotal!==directory.get(file.name)?.size||((crc^0xffffffff)>>>0)!==directory.get(file.name)?.crc){failure=new Error('DOCX 实际长度与声明不一致。');return;}if(needed){const joined=new Uint8Array(entryTotal);let offset=0;for(const chunk of chunks){joined.set(chunk,offset);offset+=chunk.length;}xml.set(file.name,new TextDecoder('utf-8',{fatal:true}).decode(joined));}}
        };file.start();
    });
    unzip.register(UnzipInflate);
    // Bound input chunks so an inflated stream can be stopped before accumulating a large output.
    for(let at=0;at<bytes.length;at+=4096){unzip.push(bytes.subarray(at,at+4096),at+4096>=bytes.length);if(failure)throw failure;}
    if(failure)throw failure;if(seen.size!==directory.size)throw new Error('DOCX 存在未读取条目。');
    for(const value of xml.values())if(/<!DOCTYPE|<!ENTITY/i.test(value)||/attachedTemplate/i.test(value)||/macroEnabled|vbaProject/i.test(value))throw new Error('DOCX 含外部引用、实体或宏，未加载。');
    const relations=new Map<string,{type:string;target:string;external:boolean}>();
    for(const [name,value] of xml)if(name.endsWith('.rels'))readXml(value,{open:tag=>{
        if(name!=='word/_rels/document.xml.rels'||tag.local!=='Relationship')return;
        const id=attribute(tag,'Id');if(!id)return;
        if(relations.has(id))throw new Error('DOCX 关系 ID 重复。');
        relations.set(id,{type:attribute(tag,'Type'),target:attribute(tag,'Target'),external:attribute(tag,'TargetMode')!==''&&attribute(tag,'TargetMode')!=='Internal'});
    }});
    const contentTypes=new Map<string,string>();
    readXml(xml.get('[Content_Types].xml')??'',{open:tag=>{if(tag.local==='Override')contentTypes.set(attribute(tag,'PartName'),attribute(tag,'ContentType'));}});
    const wordType='application/vnd.openxmlformats-officedocument.wordprocessingml.';
    if(contentTypes.get('/word/document.xml')!==wordType+'document.main+xml')throw new Error('DOCX 正文类型不匹配。');
    const references:{kind:'header'|'footer';id:string}[]=[];
    const warnings=new Set<string>();
    if([...directory.keys()].some(name=>/^word\/(footnotes|endnotes|charts\/|diagrams\/|embeddings\/)/.test(name)))warnings.add('DOCX 包含暂未提取的脚注、尾注、图表或嵌入部件；请对照原稿补录可见文字，或改用文本型 PDF。');
    let totalText=0,totalLines=0;
    function part(name:string,root:string){
        const value=xml.get(name);if(value===undefined)throw new Error('DOCX 引用部件缺失，未导入。');
        const lines:Extracted['lines']=[];let paragraph:string|null=null,textDepth=0,depth=0;
        readXml(value,{
            open:tag=>{
                depth++;
                if(depth===1&&(tag.local!==root||tag.uri!==WORD_NS))throw new Error('DOCX 部件类型或命名空间不匹配。');
                if(tag.uri===WORD_NS&&(tag.local==='headerReference'||tag.local==='footerReference')){
                    if(name!=='word/document.xml')throw new Error('DOCX 页眉/页脚嵌套引用不支持。');
                    const id=Object.values(tag.attributes).find(a=>a.local==='id'&&a.uri===REL_NS)?.value;
                    if(!id)throw new Error('DOCX 页眉/页脚引用缺少关系 ID。');
                    references.push({kind:tag.local==='headerReference'?'header':'footer',id});
                }
                if(tag.uri===WORD_NS&&tag.local==='p'){
                    if(paragraph!==null)throw new Error('DOCX 嵌套文本框暂不支持，请转为文本型 PDF 或手工录入。');
                    paragraph='';
                }
                if(tag.uri===WORD_NS&&tag.local==='t'){if(paragraph===null)throw new Error('DOCX 段落结构不支持。');textDepth++;}
                if(paragraph!==null&&tag.uri===WORD_NS){if(tag.local==='tab')paragraph+='\t';if(tag.local==='br'||tag.local==='cr')paragraph+='\n';}
                if(['drawing','pict','object','altChunk','subDoc','sym','numPr','fldSimple','instrText','footnoteReference','endnoteReference','txbxContent'].includes(tag.local)||(tag.local==='t'&&tag.uri!==WORD_NS))warnings.add('DOCX 含图片/图形、自动编号、动态域、符号、文本框或其他非标准段落文字；图片内文字及部分显示内容未提取，请对照原稿补录，或改用文本型 PDF。');
            },
            text:value=>{if(textDepth&&paragraph!==null){paragraph+=value;if(totalText+paragraph.length>IMPORT_LIMITS.text)throw new Error('原文超过 20000 字符，请拆分文件，不会截断经历。');}else if(value.trim())warnings.add('DOCX 含非标准段落文字或修订标记，部分显示文字未提取；请对照原稿补录或改用文本型 PDF。');},
            close:tag=>{
                if(tag.uri===WORD_NS&&tag.local==='t')textDepth--;
                if(tag.uri===WORD_NS&&tag.local==='p'){
                    const text=paragraph??'';totalText+=text.length+(totalLines++?1:0);
                    if(totalText>IMPORT_LIMITS.text)throw new Error('原文超过 20000 字符，请拆分文件，不会截断经历。');
                    lines.push({text,ref:`${name}:paragraph:${lines.length+1}`});paragraph=null;
                }depth--;
            }
        });return lines;
    }
    const body=part('word/document.xml','document'),headers:Extracted['lines']=[],footers:Extracted['lines']=[],read=new Set<string>();
    for(const reference of references){
        const relation=relations.get(reference.id);
        if(!relation||relation.type!==REL_NS+'/'+reference.kind||relation.external)throw new Error('DOCX 页眉/页脚关系缺失、类型错误或指向外部，未导入。');
        let target:string;try{target=decodeURIComponent(relation.target);}catch{throw new Error('DOCX 关系路径编码无效。');}
        if(!target||/[\\%?#:\x00-\x1f]/.test(target)||target.split('/').some(p=>p==='.'||p==='..'))throw new Error('DOCX 关系路径不允许。');
        const name=target.startsWith('/')?target.slice(1):'word/'+target;
        if(!name.startsWith('word/')||name.length>160||!name.endsWith('.xml')||!directory.has(name)||contentTypes.get('/'+name)!==wordType+reference.kind+'+xml')throw new Error('DOCX 引用部件缺失或类型不匹配。');
        if(read.has(name))continue;read.add(name);
        (reference.kind==='header'?headers:footers).push(...part(name,reference.kind==='header'?'hdr':'ftr'));
    }
    const extracted=checkExtracted([...headers,...body,...footers]);
    if(read.size)warnings.add('页眉/页脚按被引用部件各提取一次，按页眉、正文、页脚整理；请对照原稿核对实际页面阅读顺序。');
    return {...extracted,...(warnings.size?{warnings:[...warnings]}:{})};
}
const WORD_NS='http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const REL_NS='http://schemas.openxmlformats.org/officeDocument/2006/relationships';
function attribute(tag:SaxesTagNS,name:string){return Object.values(tag.attributes).find(a=>a.local===name&&a.uri==='')?.value??'';}
function readXml(value:string,handlers:{open?:(tag:SaxesTagNS)=>void;text?:(text:string)=>void;close?:(tag:SaxesTagNS)=>void}){
    const parser=new SaxesParser({xmlns:true});let depth=0;
    parser.on('error',()=>{throw new Error('DOCX XML 损坏。');});
    parser.on('opentag',tag=>{if(++depth>100)throw new Error('DOCX XML 嵌套过深。');handlers.open?.(tag);});
    parser.on('text',text=>handlers.text?.(text));
    parser.on('cdata',text=>handlers.text?.(text));
    parser.on('closetag',tag=>{handlers.close?.(tag);depth--;});parser.write(value).close();
}

export function checkExtracted(lines:Extracted['lines']):Extracted {
    const text=lines.map(l=>l.text).join('\n');if(!text.trim())throw new Error('未提取到文字；扫描件暂不支持 OCR，可换文件或手工填写。');
    if(text.length>IMPORT_LIMITS.text)throw new Error('原文超过 20000 字符，请拆分文件，不会截断经历。');
    return {text,lines};
}
const headings:Record<string,SectionId>={职业概述:'summary',个人优势:'summary',个人简介:'summary',工作经历:'work',项目经历:'project',关键项目成果:'project',教育背景:'education',教育经历:'education',实习经历:'internship',在校经历:'campus',专业技能:'skills',技能:'skills',技能证书:'skills',证书与荣誉:'certificates',资格证书:'certificates',证书:'certificates'};
export function buildDraft(extracted:Extracted,current:ResumeDocument):ResumeDocument {
    const next=emptyDocument();next.id=current.id;next.revision=current.revision+1;next.presentation.styleId=current.presentation.styleId;next.presentation.layoutId=current.presentation.layoutId;next.presentation.density=current.presentation.density;next.sourceText=extracted.text;
    let sourceCursor=0;next.sourceLocations=extracted.lines.map(line=>{const location={ref:line.ref,start:sourceCursor,end:sourceCursor+line.text.length};sourceCursor=location.end+1;return location;});
    const header=extracted.lines.slice(0,12).map(line=>line.text.trim()).filter(Boolean),phone=/^(?:\+?86[- ]?)?(1[3-9]\d{9})$/,email=/^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const first=header[['简历','个人简历','基本信息','个人信息'].includes(header[0])?1:0]??'';
    const nameCandidate=header.some(line=>phone.test(line)||email.test(line))&&!header.some(line=>/^姓名[：:]/.test(line))&&/^[\u4e00-\u9fff]{2,4}$/.test(first)&&!/(简历|信息|本科|硕士|博士|经理|主管|讲师)$/.test(first)?first:'';
    let section:SectionId='unknown',partName='';const order:SectionId[]=[];
    for(const [index,line] of extracted.lines.entries()){
        const part=line.ref.includes(':paragraph:')?line.ref.split(':paragraph:')[0]:'';
        if(part!==partName){section='unknown';partName=part;}
        const trimmed=line.text.trim(),heading=headings[trimmed.replace(/[：:]$/,'')];
        if(heading){section=heading;if(!order.includes(section))order.push(section);continue;}
        if(['未知栏目','自定义原文','其他信息','兴趣爱好','自我评价','基本信息'].includes(trimmed.replace(/[：:]$/,'')))section='unknown';
        const basic=trimmed.match(/^(姓名|英文名|求职方向|求职意向|手机号|电话|邮箱|城市)[：:]\s*(.*)$/);
        const keys={姓名:'name',英文名:'englishName',求职方向:'role',求职意向:'role',手机号:'phone',电话:'phone',邮箱:'email',城市:'location'} as const;
        if(basic&&basic[1] in keys){const key=keys[basic[1] as keyof typeof keys];if(!next.basic[key]){next.basic[key]=basic[2];continue;}}
        let targetId=section;
        if(section==='unknown'&&index<12){
            if(nameCandidate&&trimmed===nameCandidate&&!next.basic.name){next.basic.name=trimmed;continue;}
            const mobile=trimmed.match(phone);
            if(mobile&&!next.basic.phone){next.basic.phone=mobile[1];continue;}
            if(email.test(trimmed)&&!next.basic.email){next.basic.email=trimmed;continue;}
            if(/^(本科|硕士|博士|大专|专科)([（(\s-]|$)/.test(trimmed)){targetId='education';if(!order.includes(targetId))order.push(targetId);}
        }
        const target=next.sections.find(s=>s.id===targetId);if(target){target.text+=(target.text?(/(^|:)paragraph:/.test(line.ref)?'\n\n':'\n'):'')+line.text;if(!target.sourceRefs.includes(line.ref))target.sourceRefs.push(line.ref);}
    }
    next.presentation.reading.order=[...order.filter((id):id is Exclude<SectionId,'unknown'>=>id!=='unknown'),...sectionIds.filter((id):id is Exclude<SectionId,'unknown'>=>id!=='unknown'&&!order.includes(id))];
    next.uncertainties=['基本资料可能由页首自动预填；请对照原文核对姓名、联系方式、日期和数字，不确定内容保留在待整理栏目。'];
    next.uncertainties.push(...(extracted.warnings??[]));
    if(next.sections.find(s=>s.id==='unknown')?.text.trim())next.uncertainties.push('存在待整理内容，已完整保留；请核对归类。');
    return documentSchema.parse(next);
}
