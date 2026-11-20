import type {ResumeDocument} from '../../shared/schemas.js';
import type {Assets} from '../portrait/assets.js';
import {renderImages,imageLinks} from './browser.js';
export class PreviewSession {
    private state={urls:[] as string[],document:null as ResumeDocument|null,assets:null as Assets|null,pending:true,error:''};
    private listeners=new Set<()=>void>();
    private owned=new Set<string>();
    private controller:AbortController|null=null;
    private timer:ReturnType<typeof setTimeout>|undefined;
    constructor(private render:typeof renderImages=renderImages){}
    getSnapshot=()=>this.state;
    subscribe=(listener:()=>void)=>{this.listeners.add(listener);return()=>{this.listeners.delete(listener);};};
    private publish(update:Partial<typeof this.state>){this.state={...this.state,...update};this.listeners.forEach(listener=>listener());}
    update(document:ResumeDocument,assets:Assets){
        this.cancel();const controller=new AbortController();this.controller=controller;
        this.publish({pending:true,error:''});
        this.timer=setTimeout(()=>{
            void this.render(document,assets,controller.signal,false).then(result=>{
                if(controller.signal.aborted)return;
                const urls=imageLinks(result.blobs);urls.forEach(url=>this.owned.add(url));
                this.publish({urls,document,assets,pending:false});
            }).catch(error=>{if(!controller.signal.aborted)this.publish({pending:false,error:error instanceof Error?error.message:'图片预览失败。'});});
        },180);
    }
    cancel(){clearTimeout(this.timer);this.controller?.abort();}
    presented(urls:string[]){
        // React calls this after commit; retain both displayed URLs and any newer render awaiting commit.
        for(const url of this.owned)if(!urls.includes(url)&&!this.state.urls.includes(url)){URL.revokeObjectURL(url);this.owned.delete(url);}
    }
    dispose(){this.cancel();this.owned.forEach(url=>URL.revokeObjectURL(url));this.owned.clear();this.listeners.clear();}
}
