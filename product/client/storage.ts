import { documentSchema, snapshotSchema, type ResumeDocument, type Snapshot, emptyDocument, confirmationIssue } from '../shared/schemas.js';
import { assetsSchema, assetSchema, type Assets, type PortraitAsset } from './portrait/assets.js';
export type CommitAction='draft'|'snapshot'|'restore'|'import'|'portrait'|'confirm'|'delete'|'clear'|'suggestion';
export type CommitOptions={replacement?:ResumeDocument;assets?:PortraitAsset[]};
export type CommitResult={document:ResumeDocument;history:Snapshot[];assets?:Assets};
function references(doc:ResumeDocument){return [doc.portrait.originalAssetId,doc.portrait.appliedAssetId].filter((id):id is string=>id!==null);}
function assetReferences(doc:ResumeDocument,assets:Assets,strict=false){
 const kept=new Set<string>(),path=new Set<string>();
 function visit(id:string){if(path.has(id)){if(strict)throw new Error('照片资产引用循环。');return;}if(kept.has(id))return;kept.add(id);const asset=assets[id];if(!asset){if(strict)throw new Error('照片资产缺失，请重新导入。');return;}path.add(id);if(asset.parentId)visit(asset.parentId);if(asset.sourceId)visit(asset.sourceId);if(asset.templateId)visit(asset.templateId);path.delete(id);}
 references(doc).forEach(visit);return [...kept];
}
function assertAssets(doc:ResumeDocument,assets:Assets){
    const needed=assetReferences(doc,assets,true);
    if(doc.portrait.originalAssetId){const root=assets[doc.portrait.originalAssetId];if(root.kind!=='original'||root.parentId!==null||needed.some(id=>id!==root.id&&assets[id].parentId!==root.id))throw new Error('照片资产来源与原图不一致。');}
    const applied=doc.portrait.appliedAssetId?assets[doc.portrait.appliedAssetId]:null;
    if(applied&&applied.parentId!==doc.portrait.originalAssetId)throw new Error('照片原图与裁切版本不一致。');
}
export class DraftStore {
    constructor(private db:IDBDatabase){}
    static open(name='jianxu-product-v1'):Promise<DraftStore>{
        return new Promise((resolve,reject)=>{
            const request=indexedDB.open(name,1);let blocked=false;
            request.onupgradeneeded=()=>request.result.createObjectStore('state');
            request.onerror=()=>reject(new Error('本地存储不可用；当前内容尚未保存。'));
            request.onblocked=()=>{blocked=true;reject(new Error('数据库受其他页面阻塞，请关闭其他简序页面后刷新。'));};
            request.onsuccess=()=>{if(blocked){request.result.close();return;}const store=new DraftStore(request.result);store.db.onversionchange=()=>store.db.close();resolve(store);};
        });
    }
    close(){this.db.close();}
    load():Promise<{document:ResumeDocument|null;history:Snapshot[];assets:Assets}>{
        return new Promise((resolve,reject)=>{
            const tx=this.db.transaction('state','readonly'),store=tx.objectStore('state');const draft=store.get('draft'),history=store.get('history'),assets=store.get('assets');
            tx.oncomplete=()=>{try{resolve({document:draft.result===undefined?null:documentSchema.parse(draft.result),history:history.result===undefined?[]:snapshotSchema.array().max(40).parse(history.result),assets:assetsSchema.parse(assets.result??{})});}catch{reject(new Error('草稿格式不兼容或已损坏，已停止写入以保护原数据。'));}};
            tx.onabort=()=>reject(new Error('读取草稿失败，未覆盖原数据。'));
        });
    }
    commit(document:ResumeDocument,expectedRevision:number|null,action:CommitAction='draft',target?:Snapshot,options:CommitOptions={}):Promise<CommitResult>{
        const checked=documentSchema.parse(document);const added=(options.assets??[]).map(asset=>assetSchema.parse(asset));
        return new Promise((resolve,reject)=>{
            const tx=this.db.transaction('state','readwrite'),store=tx.objectStore('state');let result:CommitResult|undefined;
            let failure='保存失败（可能存储已满或不可用）；当前编辑仍留在页面，请重试。';
            const old=store.get('draft'),hist=store.get('history'),storedAssets=store.get('assets');
            storedAssets.onsuccess=()=>{try{
                const previous=old.result===undefined?null:documentSchema.parse(old.result);
                if((previous?.revision??null)!==expectedRevision||(previous&&(previous.id!==checked.id||checked.revision<previous.revision))){failure='另一页面已更新草稿，已停止覆盖。当前编辑仍在本页，请保留内容后重新打开。';tx.abort();return;}
                let history=hist.result===undefined?[]:snapshotSchema.array().max(40).parse(hist.result);
                const assets:Assets=assetsSchema.parse(storedAssets.result??{});
                for(const asset of added){if(assets[asset.id])throw new Error('照片资产已存在，不覆盖原图。');assets[asset.id]=asset;}
                const selected=history.find(s=>s.id===target?.id);let next=checked;
                function snapshot(doc:ResumeDocument,source:Snapshot['source']){history=[{id:crypto.randomUUID(),createdAt:new Date().toISOString(),source,document:doc},...history].slice(0,40);}
                if(action==='restore'){
                    if(!selected)throw new Error('历史版本不存在。');assertAssets(selected.document,assets);snapshot(checked,'before-restore');next=documentSchema.parse({...selected.document,revision:checked.revision+1,updatedAt:new Date().toISOString(),confirmedRevision:null});
                }else if(action==='import'||action==='portrait'||action==='suggestion'){
                    if(!options.replacement)throw new Error('缺少待应用版本。');
                    next=documentSchema.parse(options.replacement);
                    if(next.id!==checked.id||next.revision!==checked.revision+1||next.confirmedRevision!==null)throw new Error('应用版本已过期。');
                    if(action==='import')snapshot(checked,'before-import');if(action==='suggestion')snapshot(checked,'before-suggestion');if(action==='portrait')snapshot(checked,'before-portrait');snapshot(next,action);
                }else if(action==='confirm'){
                    const issue=confirmationIssue(checked);if(issue)throw new Error(issue);
                    next=documentSchema.parse({...checked,confirmedRevision:checked.revision});snapshot(next,'confirm');
                }else if(action==='snapshot')snapshot(checked,'manual');
                else if(action==='delete'){if(!selected)throw new Error('历史版本不存在。');history=history.filter(s=>s.id!==selected.id);}
                else if(action==='clear'){next=emptyDocument();history=[];}
                assertAssets(next,assets);
                const kept=new Set([next,...history.map(s=>s.document)].flatMap(doc=>assetReferences(doc,assets)));
                for(const id of Object.keys(assets))if(!kept.has(id))delete assets[id];
                store.put(next,'draft');store.put(history,'history');store.put(assets,'assets');result={document:next,history,assets};
            }catch(error){failure=error instanceof Error&&error.message.startsWith('照片')?error.message:'草稿或历史数据不可恢复/保存；已保留原数据和当前编辑。';tx.abort();}};
            tx.oncomplete=()=>{if(result)resolve(result);else reject(new Error(failure));};tx.onabort=()=>reject(new Error(failure));
        });
    }
}
