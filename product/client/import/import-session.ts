import type { ResumeDocument } from '../../shared/schemas.js';
import { buildDraft } from './core.js';
import { parseFile } from './task.js';
export type ImportState={phase:'idle'|'parsing'|'applying'|'succeeded'|'failed'|'cancelled';message:string};
// The page and timing checks share this owner for the user-visible import contract.
export class ImportSession {
    private state:ImportState={phase:'idle',message:''};
    private request:AbortController|null=null;
    private disposed=false;
    private listeners=new Set<()=>void>();
    getSnapshot=()=>this.state;
    subscribe=(listener:()=>void)=>{this.listeners.add(listener);return()=>{this.listeners.delete(listener);};};
    private publish(state:ImportState){if(this.disposed)return;this.state=state;this.listeners.forEach(listener=>listener());}
    cancel(){
        if(this.state.phase!=='parsing'||this.disposed)return false;
        this.request?.abort();this.publish({phase:'cancelled',message:'已取消解析，当前草稿未改变。'});return true;
    }
    async load(file:File,current:()=>ResumeDocument,apply:(doc:ResumeDocument,base:number)=>Promise<void>){
        if(this.disposed||this.state.phase==='applying')return false;
        this.request?.abort();const controller=new AbortController();this.request=controller;
        const {id,revision}=current();this.publish({phase:'parsing',message:'正在本地解析，文件不会上传；可取消或重新选择。'});
        try{
            const extracted=await parseFile(file,controller.signal);
            if(controller.signal.aborted||this.disposed||this.request!==controller)return false;
            const latest=current();if(latest.id!==id||latest.revision!==revision)throw new Error('解析期间内容已更新，未覆盖新编辑，请重新导入。');
            const replacement=buildDraft(extracted,latest);
            this.publish({phase:'applying',message:'正在应用并保存初稿（含原版本备份），此阶段不能取消；离开后仍可能完成保存。'});
            // Once application begins, the atomic backup/save is deliberately not cancellable.
            await apply(replacement,revision);
            if(this.disposed)return false;
            this.publish({phase:'succeeded',message:'已生成初稿并备份原版本，请对照原文核对。'});return true;
        }catch(error){
            if(!controller.signal.aborted&&!this.disposed&&this.request===controller)this.publish({phase:'failed',message:error instanceof Error?error.message:'导入失败，当前草稿未改变。'});
            return false;
        }
    }
    dispose(){if(this.state.phase==='parsing')this.request?.abort();this.disposed=true;this.listeners.clear();}
}
