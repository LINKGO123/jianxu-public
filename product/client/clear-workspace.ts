import type { DraftSession } from './draft-session.js';
import type { LocalTextApi } from './text-ai/api.js';
// Coordinate the two real cleanup boundaries; a disconnected service must not block local deletion.
export async function clearWorkspace(draft:DraftSession,api:Pick<LocalTextApi,'write'>){
    let credentialsCleared:boolean;
    try{await api.write('/api/connections',{},'DELETE');credentialsCleared=true;}
    catch{credentialsCleared=false;}
    await draft.save('clear');
    return {credentialsCleared};
}
