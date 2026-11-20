import {editDocument,type ResumeDocument} from '../../shared/schemas.js';
import {portraitResultSchema,portraitTaskStatusSchema,type PortraitInput} from '../../shared/portrait-ai.js';
import type {DraftSession} from '../draft-session.js';
import type {LocalTextApi} from '../text-ai/api.js';
import {decodePhoto} from '../portrait/decode.js';
import type {PortraitAsset} from '../portrait/assets.js';
type Task=ReturnType<typeof portraitTaskStatusSchema.parse>['task'];
type Expected=Pick<PortraitInput,'documentId'|'baseRevision'|'sourceAssetId'|'requestId'|'style'|'templateDigest'>;
type Options=ResumeDocument['portrait']['yearbook'];
export type Candidate={blob:Blob;width:number;height:number;sourceAssetId:string;documentId:string;baseRevision:number;requestId:string;faceRestored?:boolean;generatedBlob?:Blob;template?:{blob:Blob;width:number;height:number}};
export async function templateDigest(blob:Blob){const digest=await crypto.subtle.digest('SHA-256',await blob.arrayBuffer());return Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('');}
export async function imagePayload(blob:Blob){const bytes=new Uint8Array(await blob.arrayBuffer());let binary='';for(let at=0;at<bytes.length;at+=32768)binary+=String.fromCharCode(...bytes.subarray(at,at+32768));return {mime:blob.type as 'image/png'|'image/jpeg'|'image/webp',base64:btoa(binary)};}
export class PortraitAssistant{
 private state:{running:boolean;applying:boolean;taskId?:string;candidate:Candidate|null;message:string;error:string}={running:false,applying:false,candidate:null,message:'AI候选确认前不会替换当前照片。',error:''};
 private background=false;private taskConnectionId='';
 private listeners=new Set<()=>void>();private generation=0;private controller:AbortController|null=null;private requestId='';private base:{id:string;revision:number}|null=null;private disposed=false;private unsubscribe:()=>void;
 constructor(private draft:DraftSession,private api:Pick<LocalTextApi,'write'>,private decode:typeof decodePhoto=decodePhoto){this.unsubscribe=draft.subscribe(()=>{if(this.state.applying)return;const doc=draft.getSnapshot().document;if(this.state.running&&(doc?.id!==this.base?.id||doc?.revision!==this.base?.revision))this.cancel('简历已变化，旧任务不再应用。');if(this.state.candidate&&(doc?.id!==this.state.candidate.documentId||doc.revision!==this.state.candidate.baseRevision))this.publish({candidate:null,message:'候选已过期，请按当前照片重新生成。'});});}
 getSnapshot=()=>this.state;
 subscribe=(listener:()=>void)=>{this.listeners.add(listener);return()=>{this.listeners.delete(listener);};};
 private publish(update:Partial<typeof this.state>){if(this.disposed)return;this.state={...this.state,...update};this.listeners.forEach(listener=>listener());}
 async generate(source:PortraitAsset,reference:Blob|null,style:PortraitInput['style'],options:PortraitInput['options'],connectionId:string,retry?:{pendingId:string;requestId:string;vpnCompatibility:boolean},background=false){
  if(this.state.running||this.state.applying||this.disposed)return;const doc=this.draft.getSnapshot().document;if(!doc)return;
  const generation=++this.generation,controller=new AbortController();this.controller=controller;const requestId=retry?.requestId??crypto.randomUUID();this.requestId=requestId;this.base={id:doc.id,revision:doc.revision};
  this.publish({running:true,candidate:null,error:'',message:retry?'正在重新下载已有图片，不重新生成；不会自动应用。':'正在请求图片编辑，可能计费；不会自动重试或应用。'});
  try{
   let template:Candidate['template'];
   if(style.startsWith('template-')){if(!reference)throw new Error('请先选择并裁切固定模板。');const bitmap=await this.decode(reference,controller.signal);try{template={blob:reference,width:bitmap.width,height:bitmap.height};}finally{bitmap.close();}}
   const images=[];if(!retry){images.push(await imagePayload(source.blob));if(reference)images.push(await imagePayload(reference));}controller.signal.throwIfAborted();
   const input:PortraitInput={connectionId,requestId,documentId:doc.id,baseRevision:doc.revision,sourceAssetId:source.id,style,...(template?{templateDigest:await templateDigest(template.blob)}:{}),options:{presentation:options.presentation,outfit:options.outfit,hair:options.hair,retouch:options.retouch,background:options.background},images};
   this.background=background;
   const result=background?(await this.waitForTask(input,connectionId,controller.signal,input)).result!:portraitResultSchema.parse(await this.api.write(retry?'/api/connections/image/retry-download':'/api/ai/portrait',retry?{connectionId,requestId,pendingId:retry.pendingId,vpnCompatibility:retry.vpnCompatibility}:input,'POST',controller.signal));
   await this.acceptCandidate(result,input,template,controller.signal,generation);
  }catch(error){if(generation===this.generation)this.publish({error:error instanceof Error?error.message:'生成失败，原照保留。'});}
  finally{if(generation===this.generation){this.background=false;this.publish({running:false});}}
 }

 private async acceptCandidate(result:ReturnType<typeof portraitResultSchema.parse>,input:Expected,template:Candidate['template'],signal:AbortSignal,generation:number){
   if(generation!==this.generation||this.disposed)return;
   const current=this.draft.getSnapshot().document;
   if(result.templateDigest!==input.templateDigest||result.style!==input.style||result.requestId!==input.requestId||result.sourceAssetId!==input.sourceAssetId||result.documentId!==input.documentId||result.baseRevision!==input.baseRevision||current?.id!==input.documentId||current.revision!==input.baseRevision)throw new Error('候选版本或来源不匹配，未应用。');
   const bytes=Uint8Array.from(atob(result.image.base64),char=>char.charCodeAt(0));const blob=new Blob([bytes],{type:'image/png'});
   const bitmap=await this.decode(blob,signal);try{if(bitmap.width!==result.image.width||bitmap.height!==result.image.height)throw new Error('候选尺寸与解码不匹配。');}finally{bitmap.close();}
   if(generation!==this.generation||this.disposed)return;
   this.publish({candidate:{blob,width:result.image.width,height:result.image.height,sourceAssetId:input.sourceAssetId,documentId:input.documentId,baseRevision:input.baseRevision,requestId:input.requestId,...(template?{template}:{})},message:'请比较本人五官、肤色和年龄感；确认后才应用。'});
 }
 private async waitForTask(expected:Expected,connectionId:string,signal:AbortSignal,input?:PortraitInput){
  this.taskConnectionId=connectionId;this.publish({taskId:expected.requestId});
  if(input)portraitTaskStatusSchema.parse(await this.api.write('/api/ai/portrait/tasks',input,'POST',signal));
  for(;;){
   signal.throwIfAborted();
   const status=portraitTaskStatusSchema.parse(await this.api.write('/api/ai/portrait/tasks/status',{connectionId,requestId:expected.requestId},'POST',signal)),task=status.task;
   if(task.id!==expected.requestId||task.documentId!==expected.documentId||task.baseRevision!==expected.baseRevision||task.sourceAssetId!==expected.sourceAssetId||task.style!==expected.style||task.templateDigest!==expected.templateDigest)throw new Error('任务版本或来源不匹配，未应用。');
   this.publish({message:`图片任务 · ${{waiting:'等待服务生成',receiving:'正在接收图片',decoding:'正在解码图片',succeeded:'候选已返回',failed:'未完成',cancelled:'已停止'}[task.phase]} · 已等待 ${Math.floor((Date.now()-task.startedAt)/1000)} 秒。可切换页面，任务不会自动重新提交。`});
   if(status.failure)throw new Error(status.failure.error);
   if(task.phase==='succeeded'){if(!status.result)throw new Error('任务没有返回候选，未应用。');return status;}
   await new Promise<void>((resolve,reject)=>{const stop=()=>{clearTimeout(timer);reject(new Error('已停止接收任务状态。'));};const timer=setTimeout(()=>{signal.removeEventListener('abort',stop);resolve();},1000);signal.addEventListener('abort',stop,{once:true});if(signal.aborted)stop();});
  }
 }
 async resume(task:Task,connectionId:string){
  const doc=this.draft.getSnapshot().document;if(this.state.running||this.state.applying||this.state.candidate||this.disposed||doc?.id!==task.documentId||doc.revision!==task.baseRevision)return;
  const generation=++this.generation,controller=new AbortController();this.controller=controller;this.requestId=task.id;this.base={id:doc.id,revision:doc.revision};this.background=true;
  this.publish({running:true,error:'',message:'正在找回本机图片任务，不会重新生成。'});
  try{
   const expected={...task,requestId:task.id,style:task.style as PortraitInput['style']},status=await this.waitForTask(expected,connectionId,controller.signal);
   const template=status.template?{blob:new Blob([Uint8Array.from(atob(status.template.base64),char=>char.charCodeAt(0))],{type:'image/png'}),width:status.template.width,height:status.template.height}:undefined;
   await this.acceptCandidate(status.result!,expected,template,controller.signal,generation);
  }catch(error){if(generation===this.generation)this.publish({error:error instanceof Error?error.message:'任务恢复失败，当前照片保留。'});}
  finally{if(generation===this.generation){this.background=false;this.publish({running:false});}}
 }
 async importCandidate(blob:Blob,source:PortraitAsset){
  if(this.state.running||this.state.applying||this.disposed)return;
  const doc=this.draft.getSnapshot().document;if(!doc?.portrait.originalAssetId)throw new Error('请先导入本人原照。');
  const generation=++this.generation,controller=new AbortController();this.controller=controller;this.requestId='';this.base={id:doc.id,revision:doc.revision};
  this.publish({running:true,error:'',message:'正在本地读取已保存的候选，不调用AI。'});
  try{
   const bitmap=await this.decode(blob,controller.signal);let width:number,height:number;try{width=bitmap.width;height=bitmap.height;}finally{bitmap.close();}
   const current=this.draft.getSnapshot().document;
   if(this.disposed||generation!==this.generation)return;
   if(current?.id!==doc.id||current.revision!==doc.revision)throw new Error('简历已变化，未导入旧候选。');
   this.publish({candidate:{blob,width,height,sourceAssetId:source.id,documentId:doc.id,baseRevision:doc.revision,requestId:crypto.randomUUID()},message:'已从本地导入候选，未调用AI或验证生成来源；请核对本人特征后采用。'});
  }catch(error){if(generation===this.generation)this.publish({error:error instanceof Error?error.message:'候选读取失败，当前照片保留。'});}
  finally{if(generation===this.generation)this.publish({running:false});}
 }
 async restoreOriginalFace(blob:Blob,base:{id:string;revision:number;requestId?:string}){
  const candidate=this.state.candidate,doc=this.draft.getSnapshot().document;
  if(!candidate||this.state.running||this.state.applying||this.disposed||doc?.id!==base.id||doc.revision!==base.revision||candidate.requestId!==base.requestId)throw new Error('候选或原照已变化，请重新对齐。');
  const bitmap=await this.decode(blob,new AbortController().signal);
  try{if(bitmap.width!==candidate.width||bitmap.height!==candidate.height)throw new Error('回贴图片与候选尺寸不一致。');}finally{bitmap.close();}
  if(this.state.candidate!==candidate||this.draft.getSnapshot().document?.id!==base.id||this.draft.getSnapshot().document?.revision!==base.revision||this.disposed)throw new Error('候选已过期，未替换。');
  this.publish({candidate:{...candidate,generatedBlob:candidate.generatedBlob??candidate.blob,blob,faceRestored:true},error:'',message:'当前候选已在AI画面上回贴原脸，没有再次调用AI；请核对接缝、清晰度和本人特征后确认。'});
 }
 cancel(message='已停止接收并请求取消；上游可能已受理，不承诺撤销计费。'){
  if(!this.state.running)return;const generation=++this.generation;this.controller?.abort();const id=this.requestId;this.publish({running:false,message});
  if(id)void this.api.write('/api/ai/portrait/cancel',{requestId:id}).catch(()=>{if(generation===this.generation)this.publish({error:'本机取消未确认，本页仍拒绝旧结果。'});});
 }
 invalidate(){this.cancel('造型或连接已变化，旧任务不再应用。');const requestId=this.state.taskId,generation=this.generation;this.publish({candidate:null,taskId:undefined});if(requestId&&this.taskConnectionId)void this.api.write('/api/ai/portrait/tasks/dismiss',{connectionId:this.taskConnectionId,requestId}).catch(()=>{if(generation===this.generation)this.publish({error:'本机任务清除未确认；当前候选已放弃，请勿重新生成来清除状态。'});});}
 async apply(options:Options,card:Blob|null=null){
  const doc=this.draft.getSnapshot().document,candidate=this.state.candidate;if(!doc||!candidate||this.state.applying||this.disposed)return;
  if(doc.id!==candidate.documentId||doc.revision!==candidate.baseRevision||!doc.portrait.originalAssetId)throw new Error('候选已过期或原图缺失。');
  const template:PortraitAsset|null=candidate.template?{id:crypto.randomUUID(),parentId:doc.portrait.originalAssetId,kind:'template',...candidate.template}:null;
  const ai:PortraitAsset={id:crypto.randomUUID(),kind:'ai',parentId:doc.portrait.originalAssetId,sourceId:candidate.sourceAssetId,...(candidate.faceRestored?{faceRestored:true}:{}),...(template?{templateId:template.id}:{}),blob:candidate.blob,width:candidate.width,height:candidate.height};
  const applied:PortraitAsset=card?{id:crypto.randomUUID(),kind:'card',parentId:doc.portrait.originalAssetId,sourceId:ai.id,blob:card,width:720,height:1080}:ai;
  const next=editDocument(doc,d=>{d.portrait.appliedAssetId=applied.id;d.portrait.yearbook=options;});this.publish({applying:true,error:''});
  try{await this.draft.apply(next,'portrait',doc.revision,[...(template?[template]:[]),ai,...(card?[applied]:[])]);this.publish({candidate:null,message:'候选已确认并保存，原照保留。'});}
  catch(error){this.publish({error:error instanceof Error?error.message:'保存失败，原照保留。'});throw error;}
  finally{this.publish({applying:false});}
 }
 dispose(){if(this.background){this.generation++;this.controller?.abort();}else this.cancel();this.disposed=true;this.unsubscribe();this.listeners.clear();}
}
