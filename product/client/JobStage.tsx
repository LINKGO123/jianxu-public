import type {ReadingStrategy} from '../shared/schemas.js';
export function JobStage({value,disabled,change}:{value:ReadingStrategy['profile'];disabled:boolean;change:(profile:ReadingStrategy['profile'])=>void}){
    return <label>求职阶段（可选）<select disabled={disabled} value={value??''} onChange={e=>change(e.target.value as ReadingStrategy['profile']||null)}><option value="">保留原稿</option><option value="graduate">应届求职</option><option value="experienced">社会招聘</option><option value="custom">自己安排</option></select></label>;
}
