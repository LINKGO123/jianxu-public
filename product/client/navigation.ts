export function stepFromHash(hash: string): number | null {
    if (!hash)
        return 0;
    const match = hash.match(/^#step-([1-4])$/);
    return match ? Number(match[1]) - 1 : null;
}
export type Panel='workspace'|'styles'|'history'|'settings'|'guide';
export type Navigation={step:number;panel:Panel};
export type NavigationAction={type:'step';step:number;styles?:boolean}|{type:'panel';panel:Panel}|{type:'hash';hash:string};
export const workspacePanel=(panel:Panel)=>panel==='workspace'||panel==='styles';
export function navigateState(current:Navigation,action:NavigationAction):Navigation{
    if(action.type==='panel')return {...current,panel:action.panel};
    if(action.type==='step')return {step:action.styles?2:action.step,panel:action.styles?'styles':'workspace'};
    const step=stepFromHash(action.hash);
    if(step===null||step===current.step&&workspacePanel(current.panel))return current;
    return {step,panel:'workspace'};
}
