import { useEffect,useRef,useState,useSyncExternalStore } from 'react';
import type { ResumeDocument } from '../../shared/schemas.js';
import { ImportSession } from './import-session.js';
export function ImportPanel({document:doc,apply,busy,continueEditing,imported}:{document:ResumeDocument;apply:(doc:ResumeDocument,base:number)=>Promise<void>;busy:boolean;continueEditing:()=>void;imported?:(file:File,sourceText:string)=>void}){
    const latest=useRef(doc);latest.current=doc;
    const [task]=useState(()=>new ImportSession());
    const {phase,message}=useSyncExternalStore(task.subscribe,task.getSnapshot,task.getSnapshot);
    const applying=phase==='applying',disabled=busy||applying;
    useEffect(()=>()=>task.dispose(),[task]);
    async function load(file:File){if(disabled)return;if(await task.load(file,()=>latest.current,async(replacement,base)=>{await apply(replacement,base);imported?.(file,replacement.sourceText);}))continueEditing();}
    return <><h2>导入简历</h2><div className="upload-zone" onDragOver={e=>{if(!disabled)e.preventDefault();}} onDrop={e=>{e.preventDefault();if(disabled)return;const file=e.dataTransfer.files[0];if(file)void load(file);}}><strong>上传 PDF / DOCX，或拖到这里</strong><p>文本型 PDF ≤30 页，文件 ≤15 MiB；扫描件暂不支持 OCR。</p><label>选择本地文件<input disabled={disabled} type="file" accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document" onChange={e=>{const file=e.target.files?.[0];if(file)void load(file);e.target.value='';}}/></label></div>{(phase==='parsing'||applying)&&<button disabled={applying} onClick={()=>task.cancel()}>{applying?'正在应用 · 无法取消':'取消解析'}</button>}{message&&<p role={phase==='failed'?'alert':'status'}>{message}</p>}<button disabled={applying} className="primary-button" onClick={continueEditing}>手工填写 / 继续核对 →</button></>;
}
