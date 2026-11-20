import type {ResumeDocument,ReadingStrategy} from '../../shared/schemas.js';
import Reading from '../../shared/reading-model.js';
export type ImportIntent={role?:string;profile?:ReadingStrategy['profile']};
export function applyImportIntent(parsed:ResumeDocument,intent:ImportIntent):ResumeDocument{
    const next=structuredClone(parsed);
    if(intent.role!==undefined)next.basic.role=intent.role;
    if(intent.profile!==undefined)next.presentation.reading=Reading.preset(intent.profile??'',next.presentation.reading);
    return next;
}
