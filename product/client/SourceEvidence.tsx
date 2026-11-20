import type {ResumeDocument} from '../shared/schemas.js';
export function sourceLabel(ref:string){
    const word=ref.match(/^word\/(document|header\d+|footer\d+)\.xml:paragraph:(\d+)$/);
    if(word)return `Word${word[1]==='document'?'正文':word[1].startsWith('header')?'页眉':'页脚'}第${word[2]}段`;
    const page=ref.match(/^page:(\d+)(?::line:(\d+))?$/);
    return page?`PDF第${page[1]}页${page[2]?`第${page[2]}行`:''}`:ref;
}
export function SourceEvidence({refs,document:doc}:{refs:string[];document:ResumeDocument}){
    if(!refs.length)return null;
    return <details className="source-evidence"><summary>查看导入原文（{refs.length}处）</summary><p>这是导入时的原文；当前编辑不会改写来源记录。</p>{refs.map(ref=>{
        const location=doc.sourceLocations?.find(item=>item.ref===ref);
        return <div key={ref}><strong>{sourceLabel(ref)}</strong><code>{ref}</code>{location&&<pre>{doc.sourceText.slice(location.start,location.end)}</pre>}</div>;
    })}</details>;
}
