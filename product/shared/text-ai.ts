import { z } from 'zod';
import {toolProposalSchema} from './mcp.js';
import { sectionIds,type ResumeDocument } from './schemas.js';
export const textConnectionSchema=z.object({proxyCompatibility:z.boolean().optional(),baseUrl:z.string().url().max(2048),model:z.string().trim().min(1).max(100).refine(value=>!/[\r\n]/.test(value),'模型名不可含换行'),apiKey:z.string().min(1).max(512).refine(value=>!(/[^\x21-\x7e]/.test(value)),'Key仅允许无空白的ASCII字符')}).strict();
export type TextConnection=z.infer<typeof textConnectionSchema>;
export const textInputSchema=z.object({connectionId:z.string().uuid(),documentId:z.string().uuid(),baseRevision:z.number().int().nonnegative(),requestId:z.string().uuid(),mode:z.enum(['diagnose','chat']),prompt:z.string().max(2000),useMcp:z.boolean().optional(),sections:z.array(z.object({id:z.enum(sectionIds),text:z.string().min(1).max(20000)}).strict()).min(1).max(9)}).strict().superRefine((input,ctx)=>{if(input.mode==='chat'&&!input.prompt.trim())ctx.addIssue({code:'custom',message:'对话要求不能为空'});if(new Set(input.sections.map(s=>s.id)).size!==input.sections.length||input.sections.reduce((sum,s)=>sum+s.text.length,0)>20000)ctx.addIssue({code:'custom',message:'栏目重复或文本过长'});});
export type TextInput=z.infer<typeof textInputSchema>;
const changeSchema=z.object({sectionId:z.enum(sectionIds),before:z.string().min(1).max(20000),after:z.string().min(1).max(20000),reason:z.string().min(1).max(500)}).strict();
export const modelAdviceSchema=z.object({diagnosis:z.array(z.string().min(1).max(500)).max(8),questions:z.array(z.string().min(1).max(500)).max(8),suggestions:z.array(changeSchema).max(8),toolProposals:z.array(toolProposalSchema).max(5).optional()}).strict();
export type ModelAdvice=z.infer<typeof modelAdviceSchema>;
export const adviceSchema=modelAdviceSchema.extend({documentId:z.string().uuid(),baseRevision:z.number().int().nonnegative(),requestId:z.string().uuid()}).strict();
export type Advice=z.infer<typeof adviceSchema>;
export function assertGrounded(advice:ModelAdvice,input:Pick<TextInput,'sections'>){
    assertNoExactAssessment(advice);
    const seen=new Set<string>();
    for(const change of advice.suggestions){
        const source=input.sections.find(s=>s.id===change.sectionId);
        if(!source||source.text!==change.before||change.after===change.before||seen.has(change.sectionId))throw new Error('建议目标或原文不匹配，请重新请求。');
        seen.add(change.sectionId);
        // shortcut: no reliable entry boundaries yet; permit formatting only until structured entries exist.
        const formatted=change.before.replace(/\r\n/g,'\n').replace(/[ \t]+$/gm,'');
        if(change.after!==formatted||!change.after.trim())throw new Error('建议只允许统一换行与清理行尾空格；不得新增、删减或重组原文事实。');
    }
}
export function selectedText(doc:ResumeDocument,selection:typeof sectionIds[number]|typeof sectionIds[number][]):TextInput['sections']{const ids=Array.isArray(selection)?selection:[selection];if(!ids.length)throw new Error('请选择至少一个栏目。');return ids.map(id=>{const section=doc.sections.find(s=>s.id===id);if(!section?.text.trim())throw new Error('请先填写所选栏目。');return {id,text:section.text};});}

// shortcut: explicit bilingual numerical assessment patterns, not a general natural-language safety proof.
export function assertNoExactAssessment(advice:ModelAdvice){
    const recruitment=/录用|录取|入职|求职|面试|通过|成功|获聘|\b(?:offers?|hire|hired|hiring|employment|interview|acceptance|success)\b/i;
    const probability=/概率|几率|机率|机会|胜算|(?:录用|录取|成功|通过|面试)率|\b(?:probabilit(?:y|ies)|chances?|likelihood|rate|odds)\b/i;
    const score=/评分|得分|打分|匹配度|\b(?:score|rating)\b/i;
    const number=/[0-9]|百分之[零〇一二三四五六七八九十百千万两]+|[零〇一二三四五六七八九十百千万两]{2,}|[零〇一二三四五六七八九十百千万两](?:成|分)|(?:为|是|[:=])[零〇一二三四五六七八九十百千万两]+(?!\p{Script=Han})/u;
    const englishNumber='(?:zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred)';
    const englishValue=new RegExp('\\b'+englishNumber+'\\s*(?:%|percent\\b)|\\b(?:score|rating)\\s*(?:is\\s+|of\\s+|[:=]\\s*)?'+englishNumber+'\\b','i');
    for(const text of [...advice.diagnosis,...advice.questions,...advice.suggestions.map(s=>s.reason),...(advice.toolProposals??[]).map(s=>s.reason)]){
        const clauses=text.normalize('NFKC').split(/[。；;!?！？]/);
        for(const clause of clauses){
            const compact=clause.replace(/\s+/g,'');
            if(!number.test(compact)&&!englishValue.test(clause))continue;
            const hasRecruitment=recruitment.test(compact)||recruitment.test(clause);
            const hasProbability=probability.test(compact)||probability.test(clause);
            if(score.test(clause)||(hasRecruitment&&hasProbability))throw new Error('AI返回无依据的精确评分或概率，已拒绝。');
        }
    }
}
