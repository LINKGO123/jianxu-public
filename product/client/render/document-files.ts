import {zipSync,strToU8} from 'fflate';
import {documentSchema,confirmationIssue,visibleSections,sectionIds,sectionNames,type ResumeDocument} from '../../shared/schemas.js';
import {themes,PAGE} from './pages.js';
import {highlightRuns} from '../../shared/text-ranges.js';
import {presentationValues} from './presentation.js';
import {contentBlocks,dateRange,blockGap,bulletMarker} from './structure.js';

// PDF pages embed the confirmed image output; this preserves layout, not searchable text.
export function imagePdf(jpegs:Uint8Array[]){
    const encoder=new TextEncoder(),parts:Uint8Array[]=[],offsets=[0];let size=0;
    function add(value:string|Uint8Array){const bytes=typeof value==='string'?encoder.encode(value):value;parts.push(bytes);size+=bytes.length;}
    function object(id:number,value:string|Uint8Array[]){offsets[id]=size;add(`${id} 0 obj\n`);if(typeof value==='string')add(value);else value.forEach(add);add('\nendobj\n');}
    add('%PDF-1.4\n%\u00e2\u00e3\u00cf\u00d3\n');
    object(1,'<< /Type /Catalog /Pages 2 0 R >>');
    object(2,`<< /Type /Pages /Count ${jpegs.length} /Kids [${jpegs.map((_,i)=>`${3+i*3} 0 R`).join(' ')}] >>`);
    for(const [i,jpeg] of jpegs.entries()){
        const id=3+i*3,paint='q\n595.276 0 0 841.890 0 0 cm\n/Im0 Do\nQ\n';
        object(id,`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595.276 841.890] /Resources << /XObject << /Im0 ${id+2} 0 R >> >> /Contents ${id+1} 0 R >>`);
        object(id+1,`<< /Length ${encoder.encode(paint).length} >>\nstream\n${paint}endstream`);
        object(id+2,[encoder.encode(`<< /Type /XObject /Subtype /Image /Width ${PAGE.outputWidth} /Height ${PAGE.outputHeight} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>\nstream\n`),jpeg,encoder.encode('\nendstream')]);
    }
    const xref=size;add(`xref\n0 ${offsets.length}\n0000000000 65535 f \n`);for(const offset of offsets.slice(1))add(`${String(offset).padStart(10,'0')} 00000 n \n`);
    add(`trailer\n<< /Size ${offsets.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
    const bytes=new Uint8Array(size);let at=0;for(const part of parts){bytes.set(part,at);at+=part.length;}return new Blob([bytes],{type:'application/pdf'});
}

type Photo={bytes:Uint8Array;width:number;height:number};
export function editableDocx(input:ResumeDocument,photo?:Photo,icon?:Uint8Array|Record<string,Uint8Array>){
    const doc=documentSchema.parse(input),issue=confirmationIssue(doc);if(issue||doc.confirmedRevision!==doc.revision)throw new Error(issue||'请先确认当前内容。');
    const v=presentationValues(doc),custom=!!(doc.presentation.typography||doc.presentation.spacing),accent=themes[doc.presentation.styleId].accent.slice(1);
    if(v.photoVisible&&!photo)throw new Error('照片资产缺失，未生成Word。');
    if(v.icons&&!icon)throw new Error('标题图标缺失，未生成Word。');
    const legacy=!doc.presentation.typography;
    const family=v.family==='serif'?'Songti SC':v.family==='mono'||v.family==='theme'&&doc.presentation.styleId==='developer'?'SFMono-Regular':'PingFang SC',headingFamily=v.family==='theme'?(doc.presentation.styleId==='editorial'?'Songti SC':doc.presentation.styleId==='atelier'?'Georgia':family):family;
    const half=(px:number)=>Math.round(px*1.5),twips=(px:number)=>Math.round(px*15),width=doc.presentation.spacing?.margin===undefined?10200:11906-twips(v.margin)*2;
    const configuredGaps=doc.presentation.spacing?.paragraph!==undefined||Object.keys(v.groups).length>0;
    let iconId=2;
    function paragraph(text:string,style='Normal',runs?:{text:string;bold:boolean;auxiliary?:boolean}[],before?:number,section='unknown'){
        const size=style==='Title'?v.name:style==='Heading1'?v.section:style==='Heading2'?v.company:style==='Contact'?v.auxiliary:v.body;
        const runFamily=style==='Title'||style==='Heading1'?headingFamily:family,eastAsia=runFamily==='Georgia'?'Songti SC':runFamily==='SFMono-Regular'?'PingFang SC':runFamily;
        const marker=style==='Normal'?bulletMarker(text):'',colon=text.search(/[：:]/),labelEnd=colon>0&&colon<30&&(marker||/^[\p{Script=Han}][\p{Script=Han}A-Za-z0-9 /（）()·-]{1,24}[：:]/u.test(text))?colon+1:0;let runOffset=0;
        const parts=(runs??[{text,bold:false}]).flatMap(run=>{const start=runOffset;runOffset+=run.text.length;const at=labelEnd-start;
            if(style!=='Normal'||at<=0)return [run];
            return at>=run.text.length?[{...run,bold:true}]:[{...run,text:run.text.slice(0,at),bold:true},{...run,text:run.text.slice(at)}];
        });
        const content=parts.map(run=>`<w:r><w:rPr><w:rFonts w:ascii="${legacy?'Calibri':runFamily}" w:hAnsi="${legacy?'Calibri':runFamily}" w:eastAsia="${legacy?'Noto Sans CJK SC':eastAsia}" w:hint="eastAsia"/>${custom?`<w:sz w:val="${half(run.auxiliary?v.auxiliary:size)}"/>`:''}${run.bold?'<w:b/>':run.auxiliary?'<w:b w:val="0"/>':''}</w:rPr>${run.text.split('\t').map(xml).map(t=>`<w:t xml:space="preserve">${t}</w:t>`).join('<w:tab/>')}</w:r>`).join('');
        const border=style==='Heading1'&&!!doc.presentation.headings&&v.lineStyle!=='none'?`<w:pBdr><w:bottom w:val="single" w:sz="${v.lineStyle==='strong'?12:6}" w:color="${accent}"/></w:pBdr>`:'';
        const leading=style==='Heading1'&&v.icons?drawing(icon instanceof Uint8Array?'moduleIcon':'moduleIcon-'+section,180000,180000,iconId++)+'<w:r><w:t xml:space="preserve"> </w:t></w:r>':'';
        return `<w:p><w:pPr><w:pStyle w:val="${style}"/>${before===undefined?'':`<w:spacing w:before="${before}"${configuredGaps?' w:after="0"':''}/>`}${marker?`<w:ind w:left="${twips(v.body*marker.length*.6)}" w:hanging="${twips(v.body*marker.length*.6)}"/>`:""}${border}<w:tabs><w:tab w:val="right" w:pos="${Math.max(1200,width-(v.sidebar?2800:0)-300)}"/></w:tabs></w:pPr>${leading}${content}</w:p>`;
    }
    const contacts=[doc.basic.location,doc.basic.showPhone?doc.basic.phone:'',doc.basic.showEmail?doc.basic.email:''].filter(Boolean);
    const sections=visibleSections(doc).map(section=>{
        const title=paragraph(sectionNames[sectionIds.indexOf(section.id)],'Heading1',undefined,undefined,section.id),prepared=contentBlocks(section),blocks=new Map(prepared.map((block,index)=>[block.line,{block,index}]));let offset=0;
        const body=section.text.split(/\r?\n/).map((line,i)=>{const entry=blocks.get(i),block=entry?.block,style=block?.kind==='company'||block?.kind==='project'||block?.kind==='role'?'Heading2':block?.kind==='note'&&custom?'Contact':'Normal';
            const lineOffset=offset,ranges=section.highlights??[],runs=highlightRuns(line,ranges,offset);offset+=line.length+(section.text.slice(offset+line.length,offset+line.length+2)==='\r\n'?2:1);
            // Explicit spacing owns separation; empty source lines must not add a second gap.
            if(configuredGaps&&!entry)return '';
            const before=configuredGaps&&entry?twips(blockGap(prepared,entry.index,doc.presentation.spacing)):undefined,date=custom&&block?.kind==='company'?line.match(dateRange):null;
            if(date&&date.index!==undefined){const name=line.slice(0,date.index).trimEnd(),tail=line.slice(date.index+date[0].length).trimStart();return paragraph(name+'\t'+date[0],style,[...highlightRuns(name,ranges,lineOffset),{text:'\t',bold:false},...highlightRuns(date[0],ranges,lineOffset+date.index).map(run=>({...run,auxiliary:true}))],before)+(tail?paragraph(tail,'Normal',highlightRuns(tail,ranges,lineOffset+line.length-tail.length),configuredGaps?0:undefined): '');}
            return paragraph(line,style,runs,before);
        }).join('');return {id:section.id,title,body};
    });
    const sideIds=v.sidebar?doc.presentation.sidebarSections??[]:[],mainSections=sections.filter(s=>!sideIds.includes(s.id as typeof sideIds[number]));
    let main=mainSections.map(s=>s.title+s.body).join('');
    if(doc.presentation.layoutId==='table')main=table(mainSections.map(s=>[s.title,s.body]),[Math.round(width*.19),Math.round(width*.81)]);
    let side=contacts.map(c=>paragraph(c,'Contact')).join('')+sections.filter(s=>sideIds.includes(s.id as typeof sideIds[number])).map(s=>s.title+s.body).join('');
    let heading=paragraph(doc.basic.name,'Title')+(doc.basic.englishName?paragraph(doc.basic.englishName,'Contact'):'')+paragraph(doc.basic.role,'Subtitle');
    if(v.photoVisible&&photo){const h=doc.presentation.photo?Math.round(v.photoSize*9525*Math.min(1,photo.height/photo.width)):Math.round(Math.min(1100000,900000*photo.height/photo.width)),w=doc.presentation.photo?Math.round(h*photo.width/photo.height):Math.round(Math.min(900000,h*photo.width/photo.height)),image=`<w:p>${drawing('portrait',w,h,1)}</w:p>`;
        if(v.photoPosition==='sidebar'&&v.sidebar)side=image+side;
        else {const imageWidth=doc.presentation.photo?Math.round(w/635)+100:1700;heading=table([v.photoPosition==='top-left'?[image,heading]:[heading,image]],v.photoPosition==='top-left'?[imageWidth,width-imageWidth]:[width-imageWidth,imageWidth]);}
    }
    if(v.sidebar)main=table([doc.presentation.layoutId==='sidebar-left'?[side,main]:[main,side]],doc.presentation.layoutId==='sidebar-left'?[Math.round(width*.25),Math.round(width*.75)]:[Math.round(width*.75),Math.round(width*.25)]);
    else main=contacts.map(c=>paragraph(c,'Contact')).join('')+main;
    const compact=doc.presentation.density==='compact';
    const styles=`<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="${legacy?'Calibri':family}" w:hAnsi="${legacy?'Calibri':family}" w:eastAsia="${legacy?'Noto Sans CJK SC':family}"/><w:sz w:val="${custom?half(v.body):21}"/><w:lang w:val="zh-CN"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="${custom?twips(v.paragraph):compact?70:120}" w:line="${custom?Math.round(v.line*240):compact?280:320}" w:lineRule="auto"/><w:widowControl/></w:pPr></w:pPrDefault></w:docDefaults><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style>${[['Title',custom?half(v.name):40,'000000'],['Subtitle',25,accent],['Heading1',custom?half(v.section):27,accent],['Heading2',custom?half(v.company):23,'263440'],['Contact',custom?half(v.auxiliary):19,'526273']].map(([id,size,color])=>`<w:style w:type="paragraph" w:styleId="${id}"><w:name w:val="${id}"/><w:basedOn w:val="Normal"/><w:pPr>${id==='Contact'?'':'<w:keepNext/>'}<w:spacing w:before="${id==='Heading1'?custom?twips(v.module):240:0}" w:after="100"/></w:pPr><w:rPr><w:color w:val="${color}"/><w:sz w:val="${size}"/>${id==='Contact'?'':'<w:b/>'}</w:rPr></w:style>`).join('')}</w:styles>`;
    const document=`<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><w:body>${heading}${main}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="${(doc.presentation.spacing?.margin===undefined?850:twips(v.margin))}" w:right="${(doc.presentation.spacing?.margin===undefined?850:twips(v.margin))}" w:bottom="${(doc.presentation.spacing?.margin===undefined?850:twips(v.margin))}" w:left="${(doc.presentation.spacing?.margin===undefined?850:twips(v.margin))}"/></w:sectPr></w:body></w:document>`;
    const relationship='http://schemas.openxmlformats.org/officeDocument/2006/relationships/';
    const files:Record<string,Uint8Array>={
        '[Content_Types].xml':strToU8(`<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/></Types>`),
        '_rels/.rels':strToU8(`<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="document" Type="${relationship}officeDocument" Target="word/document.xml"/></Relationships>`),
        'word/document.xml':strToU8(document),'word/styles.xml':strToU8(styles),
        'word/_rels/document.xml.rels':strToU8(`<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="styles" Type="${relationship}styles" Target="styles.xml"/>${v.photoVisible&&photo?`<Relationship Id="portrait" Type="${relationship}image" Target="media/portrait.png"/>`:''}${v.icons&&icon?(icon instanceof Uint8Array?`<Relationship Id="moduleIcon" Type="${relationship}image" Target="media/module-icon.png"/>`:Object.keys(icon).map(id=>`<Relationship Id="moduleIcon-${id}" Type="${relationship}image" Target="media/module-icon-${id}.png"/>`).join('')):''}</Relationships>`)
    };
    if(v.photoVisible&&photo)files['word/media/portrait.png']=photo.bytes;
    if(v.icons&&icon){if(icon instanceof Uint8Array)files['word/media/module-icon.png']=icon;else for(const [id,bytes] of Object.entries(icon))files[`word/media/module-icon-${id}.png`]=bytes;}
    return new Blob([new Uint8Array(zipSync(files))],{type:'application/vnd.openxmlformats-officedocument.wordprocessingml.document'});
}
function xml(value:string){if(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\ufffe\uffff]/.test(value))throw new Error('内容包含Word不支持的控制字符，请清理后再导出。');return value.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]!));}
function table(rows:string[][],widths:number[]){return `<w:tbl><w:tblPr><w:tblW w:w="${widths.reduce((sum,w)=>sum+w,0)}" w:type="dxa"/><w:tblLayout w:type="fixed"/></w:tblPr><w:tblGrid>${widths.map(w=>`<w:gridCol w:w="${w}"/>`).join('')}</w:tblGrid>${rows.map(cells=>`<w:tr>${cells.map((cell,i)=>`<w:tc><w:tcPr><w:tcW w:w="${widths[i]}" w:type="dxa"/></w:tcPr>${cell||'<w:p/>'}</w:tc>`).join('')}</w:tr>`).join('')}</w:tbl><w:p/>`;}

function drawing(id:string,w:number,h:number,number:number){return `<w:r><w:drawing><wp:inline><wp:extent cx="${w}" cy="${h}"/><wp:docPr id="${number}" name="${id}"/><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic><pic:nvPicPr><pic:cNvPr id="${number}" name="${id}.png"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="${id}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${w}" cy="${h}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>`;}
