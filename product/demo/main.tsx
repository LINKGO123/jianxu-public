import './schema-runtime.js';
import { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ReadingEditor } from '../client/ReadingEditor.js';
import { StyleGallery } from '../client/StyleGallery.js';
import { ExportPanel } from '../client/render/ExportPanel.js';
import { PagedPreview } from '../client/render/PagedPreview.js';
import { confirmationIssue, editDocument, layouts, layoutNames, sectionIds, sectionNames, styles, styleNames, type ResumeDocument } from '../shared/schemas.js';
import { fictionalResume, sampleSections } from './sample.js';
import '../client/styles.css';
import './demo.css';

const steps = ['选择样例', '整理内容', '调整排版', '确认生成'];
const assets = {};

function Demo() {
    const [step, setStep] = useState(0);
    const [doc, setDoc] = useState(fictionalResume);
    const heading = useRef<HTMLHeadingElement>(null);
    const navigated = useRef(false);
    const sample = useRef<HTMLDialogElement>(null);
    const styleId = doc.presentation.styleId;
    const styleName = styleNames[styles.indexOf(styleId)];

    useEffect(() => { if (navigated.current) heading.current?.focus(); }, [step]);

    function navigate(next: number) {
        navigated.current = true;
        setStep(next);
    }

    function change(update: (draft: ResumeDocument) => void) {
        setDoc(current => editDocument(current, update));
    }

    return <>
        <a className="skip-link" href="#main-content">跳到主要内容</a>
        <header className="global-nav"><a className="global-brand" href="/" aria-label="简序演示首页"><span className="jianxu-wordmark" data-logo="editorial"><b>简序</b></span></a><span className="local-pill">网页演示</span></header>
        <div className="workflow-bar"><nav className="step-nav" aria-label="制作进度">{steps.map((label, index) =>
            <button key={label} type="button" className={`step-link${step === index ? ' active' : ''}`} aria-current={step === index ? 'step' : undefined} onClick={() => navigate(index)}><strong>{label}</strong></button>)}</nav></div>
        <main id="main-content" className="demo-main">
            <div className="page-intro"><div><h1 tabIndex={-1} ref={heading}>{steps[step]}</h1><p>仅使用虚构简历。更改和生成结果在刷新页面后清除。</p></div></div>
            {step === 0 && <section className="section-card demo-start"><div><h2>周见山 · 内容运营</h2><p>从这份虚构简历开始，核对经历、切换风格，并生成可下载成品。</p><button className="primary-button" onClick={() => navigate(1)}>开始核对 →</button></div><img src="/home/assets/sky-mirror-aged-chair.png" alt="" width="1440" height="810"/></section>}
            {step === 1 && <div className="review-layout content-review demo-columns">
                <div className="content-editor-column"><ReadingEditor document={doc} change={change} disabled={false} compact/>
                    <fieldset className="review-form-card"><legend>虚构经历</legend>{doc.sections.map((section, index) => sampleSections.has(section.id) &&
                        <div className="section-field" key={section.id}><label htmlFor={`demo-${section.id}`}>{sectionNames[sectionIds.indexOf(section.id)]}</label><textarea id={`demo-${section.id}`} maxLength={20000} rows={section.id === 'work' ? 5 : 3} value={section.text} onChange={event => { const text = event.currentTarget.value; change(draft => { draft.sections[index].text = text; }); }}/></div>)}</fieldset>
                </div><PagedPreview document={doc} assets={assets}/>
            </div>}
            {step === 2 && <div className="beauty-workspace demo-columns">
                <section className="preview-panel" aria-label="排版预览"><PagedPreview document={doc} assets={assets} interactive caption={styleName}/></section>
                <aside className="beauty-options"><StyleGallery selected={styleId} disabled={false} select={id => change(draft => { draft.presentation.styleId = id; })} openSample={() => sample.current?.showModal()}/>
                    <section className="layout-section"><h2>页面布局</h2><div className="layout-grid">{layouts.map((id, index) =>
                        <button key={id} aria-pressed={doc.presentation.layoutId === id} onClick={() => change(draft => { draft.presentation.layoutId = id; })}><span className={`layout-sketch ${id}`} aria-hidden="true"><i/><i/><i/></span>{layoutNames[index]}</button>)}</div></section>
                </aside>
                <dialog ref={sample} className="sample-dialog" aria-labelledby="sample-title"><div className="sample-dialog-top"><h2 id="sample-title">{styleName} · 风格示例</h2><form method="dialog"><button aria-label="关闭示例">关闭</button></form></div><img src={`/examples/${styleId}.png`} alt={`${styleName}虚构简历示例`}/></dialog>
            </div>}
            {step === 3 && <div className="finish-layout demo-columns"><section className="finish-summary"><h2>确认并下载</h2><ExportPanel document={doc} assets={assets} busy={false} confirm={async () => { setDoc(current => confirmationIssue(current) ? current : { ...current, confirmedRevision: current.revision }); }}/></section><PagedPreview document={doc} assets={assets}/></div>}
            {step > 0 && <div className="bottom-action"><button onClick={() => navigate(step - 1)}>← 返回上一步</button>{step < 3 && <button className="primary-button" onClick={() => navigate(step + 1)}>{steps[step + 1]} →</button>}</div>}
            <footer className="demo-footer">简序源码采用 MIT 许可证。原版展示图片的使用授权仅覆盖网页展示。</footer>
        </main>
    </>;
}

createRoot(document.getElementById('root')!).render(<Demo/>);
