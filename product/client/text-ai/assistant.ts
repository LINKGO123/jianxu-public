import { editDocument,type SectionId } from '../../shared/schemas.js';
import { adviceSchema,assertGrounded,selectedText,type Advice,type TextInput } from '../../shared/text-ai.js';
import type { DraftSession } from '../draft-session.js';
import type { LocalTextApi } from './api.js';
type Decision='pending'|'accepted'|'rejected'|'expired';
export type AssistantState={running:boolean;adopting:boolean;status:string;error:string;advice:Advice|null;decisions:Decision[];turns:string[]};
export class TextAssistant {
    private state:AssistantState={running:false,adopting:false,status:'选择栏目，核对发送范围后请求建议。',error:'',advice:null,decisions:[],turns:[]};
    private listeners=new Set<()=>void>();private generation=0;private controller:AbortController|null=null;private input:TextInput|null=null;private expectedRevision=0;private disposed=false;private unsubscribe:()=>void;
    constructor(private draft:DraftSession,private api:Pick<LocalTextApi,'write'>){this.unsubscribe=draft.subscribe(()=>{
        if(this.state.adopting)return;const doc=this.draft.getSnapshot().document;
        if(this.state.running&&this.input&&(doc?.id!==this.input.documentId||doc.revision!==this.input.baseRevision))this.cancel('内容已更新，旧请求不再应用。');
        if(this.state.advice&&(doc?.id!==this.state.advice.documentId||doc.revision!==this.expectedRevision))this.publish({decisions:this.state.decisions.map(d=>d==='pending'?'expired':d)});
    });}
    getSnapshot=()=>this.state;
    subscribe=(listener:()=>void)=>{this.listeners.add(listener);return()=>{this.listeners.delete(listener);};};
    private publish(update:Partial<AssistantState>){if(this.disposed)return;this.state={...this.state,...update};this.listeners.forEach(listener=>listener());}
    async run(mode:'diagnose'|'chat',sectionId:SectionId|SectionId[],prompt:string,connectionId:string,useMcp=false){
        if(this.state.running||this.state.adopting||this.disposed)return;
        const doc=this.draft.getSnapshot().document;if(!doc)return;
        let sections:TextInput['sections'];try{sections=selectedText(doc,sectionId);}catch(e){this.publish({error:e instanceof Error?e.message:'请选择有内容的栏目。'});return;}
        const input:TextInput={connectionId,documentId:doc.id,baseRevision:doc.revision,requestId:crypto.randomUUID(),mode,prompt,sections,...(useMcp?{useMcp:true}:{})};
        const generation=++this.generation,controller=new AbortController();this.controller=controller;this.input=input;
        this.publish({running:true,error:'',status:'正在向所示文本服务请求；不会自动应用。',advice:null,decisions:[]});
        try{
            const result=adviceSchema.parse(await this.api.write('/api/ai/text',input,'POST',controller.signal));
            if(generation!==this.generation||this.disposed)return;
            const current=this.draft.getSnapshot().document;
            if(result.requestId!==input.requestId||result.documentId!==input.documentId||result.baseRevision!==input.baseRevision||current?.id!==input.documentId||current.revision!==input.baseRevision)throw new Error('回复版本不匹配，未更新内容。');
            assertGrounded(result,input);this.expectedRevision=current.revision;
            this.publish({advice:result,decisions:result.suggestions.map(()=> 'pending'),status:'AI意见待核实；只有逐条采纳才会更新。',turns:[...this.state.turns,`${mode==='diagnose'?'诊断':prompt}\n${result.diagnosis.join('\n')}\n${result.questions.join('\n')}`].slice(-8)});
        }catch(e){if(generation===this.generation&&!this.disposed)this.publish({error:e instanceof Error?e.message:'请求失败，当前内容未改变。',status:'请求未完成，可手动重试。'});}
        finally{if(generation===this.generation)this.publish({running:false});}
    }
    cancel(message='本页已停止接收；已请求本机取消，服务可能已受理，不会自动重试。'){
        if(!this.state.running||!this.input)return;
        const id=this.input.requestId,generation=++this.generation;this.controller?.abort();this.publish({running:false,status:message,error:''});
        void this.api.write('/api/ai/text/cancel',{requestId:id}).catch(()=>{if(generation===this.generation)this.publish({error:'本机取消未获确认；本页已停止接收旧结果。'});});
    }
    reject(index:number){if(this.state.adopting||this.state.decisions[index]!=='pending')return;this.publish({decisions:this.state.decisions.map((d,i)=>i===index?'rejected':d)});}
    async accept(index:number){
        const doc=this.draft.getSnapshot().document,advice=this.state.advice,change=advice?.suggestions[index];
        if(!doc||!advice||!change||this.state.adopting||this.disposed||this.state.decisions[index]!=='pending')return;
        if(doc.id!==advice.documentId||doc.revision!==this.expectedRevision||doc.sections.find(s=>s.id===change.sectionId)?.text!==change.before){this.publish({error:'建议已过期，请按当前版本重新请求。',decisions:this.state.decisions.map(d=>d==='pending'?'expired':d)});return;}
        const next=editDocument(doc,d=>{d.sections.find(s=>s.id===change.sectionId)!.text=change.after;});
        this.publish({adopting:true,error:''});
        try{await this.draft.apply(next,'suggestion',doc.revision);this.expectedRevision=next.revision;this.publish({decisions:this.state.decisions.map((d,i)=>i===index?'accepted':d),status:'已采纳并保存；其余建议仍由你决定。'});}
        catch(e){this.publish({error:e instanceof Error?e.message:'采纳失败，当前内容保留。'});}
        finally{this.publish({adopting:false});}
    }
    dispose(){this.cancel();this.disposed=true;this.unsubscribe();this.listeners.clear();}
}
