import {styles,styleNames} from '../shared/schemas.js';
export const styleDescriptions=['宋体标题 · 深绿','衬线字体 · 暖金','系统黑体 · 蓝灰','系统黑体 · 青灰','等宽字体 · 墨绿','系统黑体 · 朱红'];
export function StyleGallery({selected,select,openSample,disabled}:{selected:typeof styles[number];select:(style:typeof styles[number])=>void;openSample:(style:typeof styles[number],trigger:HTMLButtonElement)=>void;disabled:boolean}){
    const index=styles.indexOf(selected);
    return <section className="template-section" id="style-section"><h2>视觉风格</h2><p>使用你的内容比较风格，排版和照片会保留。</p><div className="style-options" aria-label="六种视觉风格">{styles.map((id,i)=><button key={id} disabled={disabled} aria-label={`选择${styleNames[i]}风格`} aria-pressed={selected===id} onClick={()=>select(id)}><img src={`/examples/${id}.png`} loading="lazy" alt={`${styleNames[i]} · 风格参考`}/><strong>{styleNames[i]}{selected===id?' · 已选':''}</strong><small>{styleDescriptions[i]}</small></button>)}</div><div className="gallery-detail"><span className="gallery-detail-index">{String(index+1).padStart(2,'0')} / 06</span><strong>{styleNames[index]}</strong><button onClick={e=>openSample(selected,e.currentTarget)}>查看高清示例 ↗</button></div></section>;
}
