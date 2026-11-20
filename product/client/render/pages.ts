import {fontCSS,wrapText} from './text-layout.js';
import {wrapHighlighted,styledRuns} from './rich-text.js';
import {highlightRuns} from '../../shared/text-ranges.js';
import {presentationValues,fontFamilies} from './presentation.js';
import {contentBlocks,dateRange,blockGap,bulletMarker} from './structure.js';
import { type ResumeDocument, visibleSections, readingContent, sectionIds, sectionNames } from '../../shared/schemas.js';
import Reading from '../../shared/reading-model.js';
export const PAGE={width:794,height:1123,outputWidth:2480,outputHeight:3508,padding:60,maxPages:30} as const;
type TextDraw={kind:'text';text:string;x:number;y:number;size:number;weight:number;color:string;font:string;role?:'content'|'heading'};
type RectDraw={kind:'rect';x:number;y:number;width:number;height:number;color:string};
type PhotoDraw={kind:'photo';x:number;y:number;width:number;height:number;assetId:string;shape?:'square'|'circle'|'portrait'|'contain'};
type IconDraw={kind:'icon';section?:string;x:number;y:number;size:number;color:string};
export type Draw=TextDraw|RectDraw|PhotoDraw|IconDraw;
export type PagePlan=Draw[];
export const themes={editorial:{accent:'#31543e',paper:'#ffffff',font:'"Songti SC",serif'},atelier:{accent:'#756647',paper:'#fcfaf5',font:'Georgia,"Songti SC",serif'},grid:{accent:'#273b49',paper:'#ffffff',font:'"PingFang SC","Microsoft YaHei",sans-serif'},nordic:{accent:'#476c70',paper:'#ffffff',font:'"PingFang SC","Microsoft YaHei",sans-serif'},developer:{accent:'#286a60',paper:'#ffffff',font:'"SFMono-Regular",Consolas,"PingFang SC",monospace'},tokyo:{accent:'#b63e32',paper:'#ffffff',font:'"PingFang SC","Microsoft YaHei",sans-serif'}};
export {fontCSS,wrapText} from './text-layout.js';
export function planResume(doc:ResumeDocument,ctx:{font:string;measureText:(value:string)=>{width:number}},photoSize?:{width:number;height:number;kind?:string}):PagePlan[]{
    const theme=themes[doc.presentation.styleId],values=presentationValues(doc),themeFont=values.family==='theme'?theme.font:fontFamilies[values.family],pages:PagePlan[]=[],margin=values.margin,bottom=PAGE.height-(doc.presentation.spacing?.margin===undefined?55:margin);
    const sidebar=doc.presentation.layoutId==='sidebar-left'||doc.presentation.layoutId==='sidebar-right',table=doc.presentation.layoutId==='table';
    const mainX=doc.presentation.layoutId==='sidebar-left'?margin+184:margin,mainWidth=PAGE.width-margin*2-(sidebar?184:0),labelWidth=table?104:0;
    let bodyX=mainX,bodyWidth=mainWidth,textX=bodyX+labelWidth,textWidth=bodyWidth-labelWidth;
    const bodyFont=values.family==='theme'?(doc.presentation.styleId==='developer'?theme.font:fontFamilies.sans):fontFamilies[values.family];
    const bodySize=values.body,lineHeight=bodySize*values.line;let page:PagePlan=[],y=0,pageIndex=-1;const starts:number[]=[];
    const configuredGaps=doc.presentation.spacing?.paragraph!==undefined||Object.keys(values.groups).length>0;
    function text(value:string,x:number,baseline:number,size=bodySize,weight=400,color='#263440',role:'content'|'heading'='heading',font=bodyFont){page.push({kind:'text',text:value,x,y:baseline,size,weight,color,font,role});}
    function wrapped(value:string,width:number,size=bodySize,weight=400,font=bodyFont){ctx.font=fontCSS(size,weight,font);return wrapText(value,width,s=>ctx.measureText(s).width);}
    function newPage(){
        pageIndex++;if(pages[pageIndex]){page=pages[pageIndex];y=starts[pageIndex];return;}
        if(pages.length>=PAGE.maxPages)throw new Error('排版超过30页，请拆分或核对内容；未生成部分成品。');
        page=[{kind:'rect',x:0,y:0,width:PAGE.width,height:PAGE.height,color:theme.paper}];pages.push(page);
        if(doc.presentation.styleId==='tokyo')page.push({kind:'rect',x:0,y:0,width:10,height:PAGE.height,color:theme.accent});
        if(pages.length>1){const rows=wrapped(`${doc.basic.name} · ${doc.basic.role} · 续页`,PAGE.width-margin*2,12,600);rows.forEach((line,i)=>text(line,margin,45+i*18,12,600,theme.accent));y=65+rows.length*18;starts.push(y);return;}
        const showPhoto=values.photoVisible,customPhoto=!!doc.presentation.photo,sidePhoto=showPhoto&&values.photoPosition==='sidebar'&&sidebar;
        const photoShape=photoSize?.kind==='card'?'contain':values.photoShape??'contain',photoHeight=customPhoto?values.photoSize:108,photoWidth=customPhoto?(photoShape==='portrait'?values.photoSize*.75:photoShape==='contain'&&photoSize?Math.min(values.photoSize,values.photoSize*photoSize.width/photoSize.height):values.photoSize):photoSize?Math.min(88,108*photoSize.width/photoSize.height):88;
        const topPhoto=showPhoto&&!sidePhoto,leftPhoto=topPhoto&&values.photoPosition==='top-left',headerX=margin+(leftPhoto?photoWidth+20:0);
        const available=PAGE.width-margin*2-(topPhoto?customPhoto?photoWidth+20:108:0),nameStep=values.name+8,nameBaseline=doc.presentation.typography?.name===undefined?21:values.name*.85;
        const names=wrapped(doc.basic.name||'尚未填写姓名',available,values.name,700,themeFont);names.forEach((line,i)=>text(line,headerX,margin+nameBaseline+i*nameStep,values.name,700,'#263440','heading',themeFont));
        y=margin+Math.max(32,nameBaseline+11)+(names.length-1)*nameStep;
        for(const line of wrapped(doc.basic.role,available,16,600)){text(line,headerX,y+17,16,600,theme.accent);y+=24;}
        const contacts=[doc.basic.location,doc.basic.showPhone?doc.basic.phone:'',doc.basic.showEmail?doc.basic.email:''].filter(Boolean);
        if(!sidebar){for(const line of wrapped(contacts.join('  ·  '),available,values.auxiliary)){if(line){text(line,headerX,y+values.auxiliary*1.5,values.auxiliary,400,'#526273');y+=Math.max(20,values.auxiliary*1.6);}}}
        if(showPhoto){if(!photoSize)throw new Error('照片资产缺失或未解码，无法预览/导出。');if(!sidePhoto){page.push({kind:'photo',x:leftPhoto?margin:PAGE.width-margin-photoWidth,y:customPhoto?margin:52,width:photoWidth,height:photoHeight,assetId:doc.portrait.appliedAssetId!,shape:photoShape});y=Math.max(y,customPhoto?margin+photoHeight:160);}}
        y+=25;
        if(y>bottom-100)throw new Error('基本信息过长，无法排版，请核对姓名、求职方向和联系方式。');
        starts.push(y);
    }
    newPage();const primary=Reading.primary(doc.presentation.reading,readingContent(doc));
    const sections=visibleSections(doc),sideIds=sidebar?doc.presentation.sidebarSections??[]:[];
    function flow(selected:typeof sections){
    for(const section of selected){
        const title=sectionNames[sectionIds.indexOf(section.id)],emphasized=section.id===primary,blocks=contentBlocks(section);let company='',sectionStart=y;
        const prepared=blocks.map(block=>{
            const size=block.kind==='company'?values.company:block.kind==='project'||block.kind==='role'?values.project:block.kind==='note'?(doc.presentation.typography?.auxiliary===undefined?14:values.auxiliary):bodySize,weight=block.kind==='company'||block.kind==='project'?700:block.kind==='role'?600:400;
            const colon=block.text.search(/[：:]/),strongEnd=block.kind==='bullet'&&colon>0&&colon<30?block.start+colon+1:0;
            const marker=block.kind==='bullet'?bulletMarker(block.text):'',markerWidth=styledRuns(marker,section.highlights??[],block.start,400,strongEnd).reduce((sum,run)=>{ctx.font=fontCSS(size,run.weight,bodyFont);return sum+ctx.measureText(run.text).width;},0),indent=block.kind==='bullet'?Math.max(10,markerWidth):0,width=textWidth-indent;
            let rows:{value:string;start:number;size:number;weight:number;offset:number;height:number}[]=[];
            const rich=(value:string,width:number,size:number,weight:number,start:number)=>wrapHighlighted(value,section.highlights??[],start,width,size,weight,bodyFont,ctx,strongEnd);
            const measure=(value:string,size:number,weight:number,start:number)=>highlightRuns(value,section.highlights??[],start).reduce((sum,run)=>{ctx.font=fontCSS(size,run.bold?Math.max(700,weight):weight,bodyFont);return sum+ctx.measureText(run.text).width;},0);
            const companyHeight=doc.presentation.typography?.experience===undefined?25:values.company*1.5;
            const date=block.kind==='company'?block.text.match(dateRange):null;
            if(date&&date.index!==undefined){
                const name=block.text.slice(0,date.index).trimEnd(),tail=block.text.slice(date.index+date[0].length).trimStart(),nameRows=rich(name,width,values.company,700,block.start);
                const dateWidth=measure(date[0],values.auxiliary,400,block.start+date.index);
                const inline=nameRows.length===1&&measure(name,values.company,700,block.start)+dateWidth+18<=width;
                rows=nameRows.map(line=>({...line,size:values.company,weight:700,offset:0,height:companyHeight}));
                rows.push({value:date[0],start:block.start+date.index,size:values.auxiliary,weight:400,offset:inline?width-dateWidth:0,height:inline?0:20});
                rows.push(...rich(tail,width,bodySize,600,block.start+block.text.length-tail.length).filter(line=>line.value).map(line=>({...line,size:bodySize,weight:600,offset:0,height:lineHeight})));
            }else if(block.kind==='project'&&block.text.length>70&&block.text.indexOf('：')>1&&block.text.indexOf('：')<70){
                const split=block.text.indexOf('：')+1;
                rows=[...rich(block.text.slice(0,split),width,values.project,700,block.start).map(line=>({...line,size:values.project,weight:700,offset:0,height:lineHeight})),...rich(block.text.slice(split),width,bodySize,400,block.start+split).map(line=>({...line,size:bodySize,weight:400,offset:0,height:lineHeight}))];
            }else rows=rich(block.text.slice(marker.length),width,size,weight,block.start+marker.length).map(line=>({...line,size,weight,offset:indent,height:doc.presentation.typography?Math.max(lineHeight,size*1.3):lineHeight}));
            return {block,rows,strongEnd,marker};
        });
        function openingHeight(index:number){
            let height=0;
            for(let at=index;at<prepared.length;at++){
                const {block,rows}=prepared[at],title=block.kind==='company'||block.kind==='project'||block.kind==='role';
                if(at>index)height+=configuredGaps?blockGap(blocks,at,doc.presentation.spacing):16;
                if(!title){height+=rows.slice(0,2).reduce((sum,row)=>sum+row.height,0);break;}
                if(block.kind==='project'&&rows.some(row=>row.weight===400)){const start=rows.findIndex(row=>row.weight===400);height+=rows.slice(0,start+2).reduce((sum,row)=>sum+row.height,0);break;}
                height+=rows.reduce((sum,row)=>sum+row.height,0);
            }
            return Math.min(height,bottom-200);
        }
        const customHeading=doc.presentation.typography?.section!==undefined||!!doc.presentation.headings;
        const headingSize=values.section*(emphasized?20/18:1),iconSize=Math.min(headingSize,18),headingOffset=values.icons?iconSize+7:0;
        const headingLines=(continued=false)=>wrapped(title+(continued?'（续）':''),(table?labelWidth-16:bodyWidth)-headingOffset,headingSize,700,themeFont);
        let currentLabelHeight=0;
        function drawHeading(continued=false){
            if(!customHeading){if(table)wrapped(title+(continued?'（续）':''),labelWidth-16,16,700,themeFont).forEach((line,i)=>text(line,bodyX,y+18+i*23,16,700,theme.accent,'heading',themeFont));else {text(title+(continued?'（续）':''),bodyX,y+20,headingSize,700,theme.accent,'heading',themeFont);page.push({kind:'rect',x:bodyX,y:y+29,width:bodyWidth,height:emphasized?1.5:1,color:theme.accent});y+=44;}return;}
            const rows=headingLines(continued),step=headingSize*1.4;currentLabelHeight=rows.length*step+10;
            if(values.icons)page.push({kind:'icon',section:section.id,x:bodyX,y:y+4,size:iconSize,color:theme.accent});
            rows.forEach((line,i)=>text(line,bodyX+headingOffset,y+headingSize+i*step,headingSize,700,theme.accent,'heading',themeFont));
            if(table&&values.lineStyle!=='none')page.push({kind:'rect',x:bodyX,y:y+rows.length*step+5,width:labelWidth-16,height:values.lineStyle==='strong'?2:1,color:theme.accent});
            if(!table){const h=Math.max(44,rows.length*step+18);if(values.lineStyle!=='none')page.push({kind:'rect',x:bodyX,y:y+h-15,width:bodyWidth,height:values.lineStyle==='strong'?2:emphasized?1.5:1,color:theme.accent});y+=h;}
        }
        function continuePage(context=company){newPage();sectionStart=y;drawHeading(true);if(context)for(const line of wrapped(context+'（续）',textWidth,12,600)){text(line,textX,y+15,12,600,'#526273');y+=22;}}
        const labelHeight=customHeading?headingLines().length*headingSize*1.4+10:65,headingHeight=table?0:customHeading?Math.max(44,labelHeight+8):44;
        const sectionHeight=Math.max(prepared.reduce((sum,{rows},index)=>sum+rows.reduce((n,row)=>n+row.height,0)+blockGap(blocks,index,doc.presentation.spacing),headingHeight),table?65:0)+24;
        if(y+headingHeight+openingHeight(0)>bottom||(sectionHeight<=300&&y+sectionHeight>bottom))newPage();sectionStart=y;drawHeading();
        for(const [index,{block,rows,strongEnd,marker}] of prepared.entries()){
            const gap=blockGap(blocks,index,doc.presentation.spacing);
            if(y+gap+openingHeight(index)>bottom)continuePage(block.kind==='company'?'':company);else y+=gap;
            if(block.kind==='company')company=block.text;
            let priorBaseline=0,firstRow=true;
            for(const row of rows){
                if(row.height&&y+row.height>bottom)continuePage();
                const baseline=row.height===0?priorBaseline:y+row.height*.76;
                const color=block.kind==='note'?'#526273':'#263440';if(firstRow&&marker){let markerX=textX;for(const run of styledRuns(marker,section.highlights??[],block.start,400,strongEnd)){text(run.text,markerX,baseline,row.size,run.weight,color,'content');ctx.font=fontCSS(row.size,run.weight,bodyFont);markerX+=ctx.measureText(run.text).width;}}firstRow=false;
                let x=textX+row.offset;for(const run of styledRuns(row.value,section.highlights??[],row.start,row.weight,strongEnd)){text(run.text,x,baseline,row.size,run.weight,color,'content');ctx.font=fontCSS(row.size,run.weight,bodyFont);x+=ctx.measureText(run.text).width;}
                priorBaseline=baseline;y+=row.height;
            }
        }
        y=Math.max(y,sectionStart+(table?Math.max(65,labelHeight,currentLabelHeight):0))+values.module;
    }
    }
    flow(sections.filter(section=>!sideIds.includes(section.id as typeof sideIds[number])));
    if(sidebar){
        pageIndex=-1;bodyX=doc.presentation.layoutId==='sidebar-left'?margin:PAGE.width-margin-160;bodyWidth=160;textX=bodyX;textWidth=160;newPage();
        if(values.photoVisible&&values.photoPosition==='sidebar'){page.push({kind:'photo',x:bodyX,y,width:values.photoSize*(photoSize?.kind==='card'||values.photoShape==='contain'?Math.min(1,(photoSize?.width??1)/(photoSize?.height??1)):values.photoShape==='portrait'?.75:1),height:values.photoSize,assetId:doc.portrait.appliedAssetId!,shape:photoSize?.kind==='card'?'contain':values.photoShape});y+=values.photoSize+18;}
        for(const contact of [doc.basic.location,doc.basic.showPhone?doc.basic.phone:'',doc.basic.showEmail?doc.basic.email:''].filter(Boolean)){
            for(const line of wrapped(contact,150,values.auxiliary)){if(y+22>bottom)newPage();text(line,bodyX,y+(doc.presentation.typography?.auxiliary===undefined?8:values.auxiliary),values.auxiliary,400,'#526273');y+=20;}y+=8;
        }
        flow(sections.filter(section=>sideIds.includes(section.id as typeof sideIds[number])));
    }
    pages.forEach((commands,index)=>commands.push({kind:'text',text:`${index+1} / ${pages.length}`,x:PAGE.width-margin-44,y:PAGE.height-26,size:11,weight:400,color:'#596b78',font:bodyFont}));
    return pages;
}
export function paintPage(ctx:CanvasRenderingContext2D,plan:PagePlan,images:Map<string,CanvasImageSource>,width:number=PAGE.outputWidth,height:number=PAGE.outputHeight){
    ctx.setTransform(width/PAGE.width,0,0,height/PAGE.height,0,0);ctx.textBaseline='alphabetic';
    for(const draw of plan){
        if(draw.kind==='rect'){ctx.fillStyle=draw.color;ctx.fillRect(draw.x,draw.y,draw.width,draw.height);}
        else if(draw.kind==='text'){ctx.fillStyle=draw.color;ctx.font=fontCSS(draw.size,draw.weight,draw.font);ctx.fillText(draw.text,draw.x,draw.y);}
        else if(draw.kind==='icon')paintSectionIcon(ctx,draw.x,draw.y,draw.size,draw.color,draw.section);
        else {const image=images.get(draw.assetId);if(!image)throw new Error('照片资产缺失，未导出。');paintPhoto(ctx,image,draw.x,draw.y,draw.width,draw.height,draw.shape);}
    }
    ctx.resetTransform();
}

export function paintSectionIcon(ctx:CanvasRenderingContext2D,x:number,y:number,size:number,color:string,section='unknown'){
    ctx.save();ctx.translate(x,y);ctx.scale(size/24,size/24);ctx.strokeStyle=color;ctx.lineWidth=1.7;ctx.lineJoin='round';ctx.lineCap='round';ctx.beginPath();
    const line=(...points:number[])=>{ctx.moveTo(points[0],points[1]);for(let i=2;i<points.length;i+=2)ctx.lineTo(points[i],points[i+1]);};
    if(section==='work'||section==='internship'){ctx.rect(3,7,18,14);ctx.rect(8,3,8,4);line(3,12,21,12);line(12,10,12,15);}
    else if(section==='education'||section==='campus'){line(2,9,12,4,22,9,12,14,2,9);line(6,12,6,18,12,21,18,18,18,12);line(22,9,22,17);}
    else if(section==='project'){line(3,20,3,5,10,5,12,8,21,8,21,20,3,20);line(7,12,17,12);line(7,16,14,16);}
    else if(section==='skills'){line(8,6,2,12,8,18);line(16,6,22,12,16,18);line(14,3,10,21);}
    else if(section==='certificates'){ctx.arc(12,9,6,0,Math.PI*2);line(8,14,6,22,12,19,18,22,16,14);}
    else if(section==='summary'){ctx.arc(12,7,4,0,Math.PI*2);ctx.moveTo(3,22);ctx.bezierCurveTo(3,11,21,11,21,22);}
    else {ctx.rect(4,3,16,18);line(8,8,16,8);line(8,12,16,12);line(8,16,13,16);}
    ctx.stroke();ctx.restore();
}
export function paintPhoto(ctx:CanvasRenderingContext2D,image:CanvasImageSource,x:number,y:number,width:number,height:number,shape?:'square'|'circle'|'portrait'|'contain'){
    if(!shape){ctx.drawImage(image,x,y,width,height);return;}
    if(shape==='contain'){const source=image as ImageBitmap,scale=Math.min(width/source.width,height/source.height),w=source.width*scale,h=source.height*scale;ctx.drawImage(image,x+(width-w)/2,y+(height-h)/2,w,h);return;}
    const source=image as ImageBitmap,scale=Math.max(width/source.width,height/source.height),sw=width/scale,sh=height/scale;
    ctx.save();if(shape==='circle'){ctx.beginPath();ctx.ellipse(x+width/2,y+height/2,width/2,height/2,0,0,Math.PI*2);ctx.clip();}
    ctx.drawImage(image,(source.width-sw)/2,(source.height-sh)/2,sw,sh,x,y,width,height);ctx.restore();
}
