import type {ResumeDocument} from '../../shared/schemas.js';
export const ptToPx=(pt:number)=>pt*4/3;
export const mmToPx=(mm:number)=>mm*96/25.4;
export const fontFamilies={sans:'"PingFang SC","Microsoft YaHei",sans-serif',serif:'"Songti SC",Georgia,serif',mono:'"SFMono-Regular",Consolas,"PingFang SC",monospace'};
export const recommendedTypography={name:26,section:14,experience:12,body:11,auxiliary:9.5};
export function presentationValues(doc:ResumeDocument){
    const p=doc.presentation,t=p.typography,s=p.spacing,compact=p.density==='compact';
    const legacyBody=compact?14:15,body=t?.body===undefined?legacyBody:ptToPx(t.body),auxiliary=t?.auxiliary===undefined?12:ptToPx(t.auxiliary),company=t?.experience===undefined?17:ptToPx(t.experience);
    // Unconfigured old drafts keep their original smaller project headings.
    return {name:t?.name===undefined?30:ptToPx(t.name),section:t?.section===undefined?18:ptToPx(t.section),company,project:t?company:body,body,auxiliary,
        line:s?.line===undefined?(compact?22:24)/legacyBody:s.line,paragraph:s?.paragraph===undefined?12:ptToPx(s.paragraph),module:s?.module===undefined?24:ptToPx(s.module),margin:s?.margin===undefined?60:mmToPx(s.margin),family:t?.family??'theme',groups:s?.groups??{},
        sidebar:p.layoutId==='sidebar-left'||p.layoutId==='sidebar-right',photoVisible:!!doc.portrait.appliedAssetId&&p.photo?.visible!==false,photoPosition:p.photo?.position==='sidebar'&&!p.layoutId.startsWith('sidebar')?'top-right':p.photo?.position??'top-right',photoSize:ptToPx(p.photo?.size??81),photoShape:p.photo?.shape,icons:p.headings?.icons??false,lineStyle:p.headings?.line??'thin'};
}
