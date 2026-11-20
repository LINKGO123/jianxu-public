import { type ResumeDocument, sectionIds, sectionNames, visibleSections, readingContent } from '../shared/schemas.js';
import {highlightRuns} from '../shared/text-ranges.js';
import Reading from '../shared/reading-model.js';
export function Preview({ document: doc }: {
    document: ResumeDocument;
}) {
    const sections = visibleSections(doc);
    const primary = Reading.primary(doc.presentation.reading, readingContent(doc));
    return <article className={`resume-page style-${doc.presentation.styleId} layout-${doc.presentation.layoutId}`} aria-label="当前简历排版预览">
    <header className="resume-heading"><span>个人简历</span><h2>{doc.basic.name || '尚未填写姓名'}</h2><p>{doc.basic.role}</p></header>
    <aside className="resume-contact" aria-label="联系方式">{[doc.basic.location, doc.basic.showPhone ? doc.basic.phone : '', doc.basic.showEmail ? doc.basic.email : ''].filter(Boolean).map((value, i) => <p key={i}>{value}</p>)}</aside>
    <div className="resume-content">{sections.map(section => <section key={section.id} data-section-id={section.id} className={section.id === primary ? 'reading-primary' : undefined}><h3>{sectionNames[sectionIds.indexOf(section.id)]}</h3><p>{highlightRuns(section.text,section.highlights??[]).map((run,i)=>run.bold?<strong key={i}>{run.text}</strong>:run.text)}</p></section>)}{!sections.length && <p className="empty-hint">当前草稿为空。在内容核对中填写真实经历后，这里会同步呈现。</p>}</div>
  </article>;
}
