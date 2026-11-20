import {JobStage} from './JobStage.js';
import { useRef, useState } from 'react';
import { readingContent, visibleSections, sectionIds, sectionNames, type ResumeDocument, type ReadingStrategy } from '../shared/schemas.js';
import Reading from '../shared/reading-model.js';
const label = (id: string) => sectionNames[sectionIds.findIndex(item => item === id)];

export function reorderReading(reading: ReadingStrategy, from: string, before: string): ReadingStrategy {
    if (from === before || !reading.order.some(id => id === from) || !reading.order.some(id => id === before)) return reading;
    const order = reading.order.filter(id => id !== from);
    const moved = reading.order.find(id => id === from);
    if (!moved) return reading;
    order.splice(order.findIndex(id => id === before), 0, moved);
    return Reading.normalize({ ...reading, profile: 'custom', order });
}
export function ReadingEditor({ document: doc, change, disabled, compact=false }: {
    document: ResumeDocument; change: (fn: (d: ResumeDocument) => void) => void; disabled: boolean; compact?:boolean;
}) {
    const reading = doc.presentation.reading, content = readingContent(doc);
    const primary = Reading.primary(reading, content), shown = visibleSections(doc);
    const hidden = reading.hidden.filter(id => Reading.available(id, content));
    const empty = reading.order.filter(id => !Reading.available(id, content));
    const requested = reading.emphasis !== 'auto' ? reading.emphasis : reading.baseProfile === 'graduate' ? 'education' : reading.baseProfile === 'experienced' ? 'work' : null;
    const [feedback, setFeedback] = useState('');
    const dragged = useRef<string | null>(null);
    const [dragging, setDragging] = useState<string | null>(null), [dropTarget, setDropTarget] = useState<string | null>(null);
    function finishDrag() { dragged.current = null; setDragging(null); setDropTarget(null); }
    function move(index: number, delta: number, button: HTMLButtonElement) {
        const row = button.closest('li');
        change(d => { const order = [...d.presentation.reading.order]; [order[index], order[index + delta]] = [order[index + delta], order[index]]; d.presentation.reading = Reading.normalize({ ...d.presentation.reading, profile: 'custom', order }); });
        setFeedback(`已${delta < 0 ? '上移' : '下移'}${label(reading.order[index])}，经历内容保持原样。`);
        requestAnimationFrame(() => { if (button.disabled && row?.isConnected) row.querySelector<HTMLButtonElement>('.reading-row-actions button:not(:disabled)')?.focus(); });
    }
    const editor=<fieldset className="reading-editor" disabled={disabled}><legend>先让面试官看到什么</legend>
        {!compact&&<JobStage value={reading.profile} disabled={disabled} change={profile=>{change(d=>{d.presentation.reading=Reading.preset(profile??'',d.presentation.reading);});setFeedback('已调整求职阶段，未改写经历。');}}/>}
        <label>重点展示<select value={reading.emphasis} onChange={e => { change(d => { d.presentation.reading = Reading.normalize({ ...d.presentation.reading, emphasis: e.target.value }); }); setFeedback('重点选择已更新，其他栏目内容保留。'); }}><option value="auto">按阅读策略</option><option value="education">教育背景</option><option value="work">工作经历</option><option value="project">项目经历</option></select></label>
        <p className="reading-emphasis-note">{requested && !shown.some(s => s.id === requested) ? `${label(requested)}暂无可展示内容，${primary ? `当前由${label(primary)}承接重点。` : '当前没有可展示的重点。'}` : primary ? `${label(primary)}获得更醒目的标题和段落空间；其他栏目保留完整内容。` : '当前按原稿呈现，可自行指定重点。'}</p>
        <p>拖动左侧手柄，或使用上下移动按钮。隐藏只影响预览，空栏目自动跳过。</p>
        <ol className="reading-order-list">{reading.order.map((id, index) => <li key={id} className={`${reading.hidden.includes(id) ? 'is-hidden' : ''} ${dragging === id ? 'is-dragging' : ''} ${dropTarget === id ? 'is-drop-target' : ''}`}
            onDragOver={e => { if (!disabled && dragged.current && dragged.current !== id) { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; setDropTarget(id); } }}
            onDragLeave={() => setDropTarget(null)} onDrop={e => { e.preventDefault(); const from = dragged.current; finishDrag(); if (!disabled && from && from !== id) { change(d => { d.presentation.reading = reorderReading(d.presentation.reading, from, id); }); setFeedback(`已把${label(from)}移到${label(id)}之前。`); } }}>
            <button type="button" className="reading-grip" draggable={!disabled} aria-label={`拖动${label(id)}，也可使用上移下移按钮`} onDragStart={e => { if (disabled) { e.preventDefault(); return; } dragged.current = id; setDragging(id); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', id); }} onDragEnd={finishDrag}>⠿</button>
            <label><input type="checkbox" checked={!reading.hidden.includes(id)} onChange={e => { change(d => { const current = d.presentation.reading; d.presentation.reading = Reading.normalize({ ...current, hidden: e.target.checked ? current.hidden.filter(x => x !== id) : [...current.hidden, id] }); }); setFeedback(`${label(id)}${e.target.checked ? '已恢复展示' : '已隐藏，内容仍可在核对页编辑'}。`); }}/><span>{label(id)}<small>{!Reading.available(id, content) ? '未填写 · 预览自动跳过' : reading.hidden.includes(id) ? '已隐藏 · 内容保留' : '有内容 · 将在简历中展示'}</small></span></label>
            <div className="reading-row-actions"><button type="button" disabled={index === 0 || disabled} aria-label={`上移${label(id)}`} onClick={e => move(index, -1, e.currentTarget)}>↑</button><button type="button" disabled={index === reading.order.length - 1 || disabled} aria-label={`下移${label(id)}`} onClick={e => move(index, 1, e.currentTarget)}>↓</button></div>
        </li>)}</ol>
        <div className="reading-path-box"><strong>面试官的阅读路径</strong><ol className="reading-path">{shown.map((section, i) => <li key={section.id} className={section.id === primary ? 'is-emphasized' : ''}><span>{String(i + 1).padStart(2, '0')}</span>{label(section.id)}</li>)}{!shown.length && <li>暂无有内容的展示栏目</li>}</ol>
            {empty.length > 0 && <p>未填写，已跳过：{empty.map(label).join('、')}</p>}{hidden.length > 0 && <p>已隐藏：{hidden.map(label).join('、')}；原内容仍可在核对页编辑。</p>}</div>
        <p className="reading-feedback" role="status">{feedback}</p><button type="button" onClick={() => { change(d => { d.presentation.reading = Reading.preset(d.presentation.reading.baseProfile || '', d.presentation.reading); }); setFeedback('已恢复推荐顺序与展示状态，经历内容保持原样。'); }}>恢复推荐顺序</button>
    </fieldset>;
    return compact?<div className="reading-overview"><JobStage value={reading.profile} disabled={disabled} change={profile=>change(d=>{d.presentation.reading=Reading.preset(profile??'',d.presentation.reading);})}/><dl><dt>阅读策略</dt><dd>{Reading.name(reading)}</dd><dt>重点栏目</dt><dd>{primary?label(primary):'按原稿呈现'}</dd><dt>阅读顺序</dt><dd>{shown.map(section=>label(section.id)).join(' → ')||'暂无可展示栏目'}</dd></dl>{hidden.length>0&&<p>已隐藏：{hidden.map(label).join('、')}；内容仍可编辑。</p>}<details><summary>调整阅读顺序</summary>{editor}</details></div>:editor;
}
