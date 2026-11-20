import {textBoundaries} from './text-ranges.js';
import { z } from 'zod';
import Reading from './reading-model.js';
import Yearbook from './yearbook-model.js';
import {toolManifestSchema} from './mcp.js';
export const styles = ['editorial', 'atelier', 'grid', 'nordic', 'developer', 'tokyo'] as const;
export const styleNames = ['编辑式杂志', '法式编辑', '几何极简', '北欧极简', '开发者', '东京现代主义'];
export const layouts = ['single', 'sidebar-left', 'sidebar-right', 'table'] as const;
export const layoutNames = ['单栏标准', '左侧信息栏', '右侧信息栏', '表格网格'];
export const sectionIds = ['summary', 'work', 'project', 'education', 'internship', 'campus', 'skills', 'certificates', 'unknown'] as const;
export const sectionNames = ['职业概述', '工作经历', '项目经历', '教育背景', '实习经历', '在校经历', '专业技能', '证书与荣誉', '待整理内容'];
const text = z.string().max(20000);
export const blockKinds=['body','company','role','project','bullet','note'] as const;
const rangeSchema=z.object({start:z.number().int().nonnegative(),end:z.number().int().positive()}).strict();
const sectionSchema=z.object({id:z.enum(sectionIds),text,sourceRefs:z.array(z.string().max(200)).max(20000),highlights:z.array(rangeSchema).max(500).optional(),formatting:z.array(z.object({line:z.number().int().nonnegative(),kind:z.enum(blockKinds)}).strict()).max(20000).optional()}).strict().superRefine((section,ctx)=>{
    if(section.highlights?.length){const boundaries=textBoundaries(section.text);let end=0;for(const range of section.highlights){if(range.start<end||range.end<=range.start||range.end>section.text.length||!boundaries.has(range.start)||!boundaries.has(range.end))ctx.addIssue({code:'custom',message:'重点范围与当前原文不匹配'});end=range.end;}}
    const lines=section.text.split(/\r?\n/);
    if(section.formatting&&(new Set(section.formatting.map(f=>f.line)).size!==section.formatting.length||section.formatting.some(f=>f.line>=lines.length||!lines[f.line].trim())))ctx.addIssue({code:'custom',message:'段落分组位置已失效，请重新核对。'});
});
export const readingSchema = z.object({
    profile: z.enum(['graduate', 'experienced', 'custom']).nullable(),
    baseProfile: z.enum(['graduate', 'experienced']).nullable(),
    order: z.array(z.enum(sectionIds).exclude(['unknown'])).length(8),
    hidden: z.array(z.enum(sectionIds).exclude(['unknown'])).max(8),
    emphasis: z.enum(['auto', 'education', 'work', 'project'])
}).strict().superRefine((reading, ctx) => {
    if (new Set(reading.order).size !== 8 || new Set(reading.hidden).size !== reading.hidden.length)
        ctx.addIssue({ code: 'custom', message: '阅读顺序或隐藏栏目重复' });
});
export const yearbookSchema = z.object({
    presentation: z.enum(['keep', 'male', 'female']), format: z.enum(['photo', 'card']),
    nameMode: z.enum(['given', 'full', 'english', 'custom']), nameText: z.string().max(40),
    mottoId: z.enum(['none', 'growth', 'purpose', 'steady', 'custom']), mottoText: z.string().max(160),
    outfit: z.enum(['keep', 'college', 'business']), hair: z.enum(['keep', 'neat', 'styled']),
    retouch: z.enum(['natural', 'light']), background: z.enum(['bluegray', 'sky', 'gray'])
}).strict();
export const documentSchema = z.object({
    schemaVersion: z.literal(1), id: z.string().uuid(), revision: z.number().int().nonnegative(),
    updatedAt: z.string().datetime(), confirmedRevision: z.number().int().nonnegative().nullable(),
    basic: z.object({ name: text, englishName: text, role: text, phone: text, email: text, location: text,
        showPhone: z.boolean(), showEmail: z.boolean() }).strict(),
    sections: z.array(sectionSchema).length(9),
    sourceText: text, sourceLocations: z.array(z.object({ref:z.string().max(200),start:z.number().int().nonnegative(),end:z.number().int().nonnegative()}).strict()).max(20000).optional(), uncertainties: z.array(z.string().max(500)).max(100),
    presentation: z.object({ styleId: z.enum(styles), layoutId: z.enum(layouts), density: z.enum(['comfortable','compact']).default('comfortable'), reading: readingSchema,
        typography:z.object({family:z.enum(['theme','sans','serif','mono']).optional(),name:z.number().min(20).max(32).optional(),section:z.number().min(12).max(18).optional(),experience:z.number().min(10.5).max(15).optional(),body:z.number().min(10).max(13).optional(),auxiliary:z.number().min(8.5).max(11).optional()}).strict().optional(),
        spacing:z.object({line:z.number().min(1.3).max(2).optional(),paragraph:z.number().min(0).max(18).optional(),module:z.number().min(8).max(30).optional(),margin:z.number().min(12).max(25).optional(),groups:z.object({company:z.number().min(0).max(24).optional(),role:z.number().min(0).max(24).optional(),project:z.number().min(0).max(24).optional(),bullet:z.number().min(0).max(24).optional(),note:z.number().min(0).max(24).optional(),body:z.number().min(0).max(24).optional()}).strict().optional()}).strict().optional(),
        sidebarSections:z.array(z.enum(['summary','skills','certificates'])).max(3).refine(ids=>new Set(ids).size===ids.length,'侧栏栏目重复').optional(),
        photo:z.object({visible:z.boolean(),position:z.enum(['top-left','top-right','sidebar']),size:z.number().min(48).max(84),shape:z.enum(['square','circle','portrait','contain'])}).strict().optional(),
        headings:z.object({icons:z.boolean(),line:z.enum(['none','thin','strong'])}).strict().optional()
    }).strict(),
    portrait: z.object({ originalAssetId: z.string().uuid().nullable(), appliedAssetId: z.string().uuid().nullable(),
        crop: z.object({ x: z.number().finite(), y: z.number().finite(), zoom: z.number().positive(), rotation: z.number().finite(), ratio: z.enum(['3:4', '1:1']) }).strict().nullable(),
        yearbook: yearbookSchema }).strict()
}).strict().superRefine((doc, ctx) => {
    if (new Set(doc.sections.map(s => s.id)).size !== 9)
        ctx.addIssue({ code: 'custom', message: '栏目 ID 重复' });
    let sourceCursor=0;
    for(const location of doc.sourceLocations??[]){
        if(location.start!==sourceCursor||location.end<location.start||location.end>doc.sourceText.length)ctx.addIssue({code:'custom',message:'原文位置无效'});
        sourceCursor=location.end+1;
    }
    if(doc.sourceLocations?.length&&sourceCursor!==doc.sourceText.length+1)ctx.addIssue({code:'custom',message:'原文位置不完整'});
    if (doc.confirmedRevision !== null && doc.confirmedRevision !== doc.revision)
        ctx.addIssue({ code: 'custom', message: '确认版本过期' });
});
export type ResumeDocument = z.infer<typeof documentSchema>;
export type ReadingStrategy = z.infer<typeof readingSchema>;
export type SectionId = typeof sectionIds[number];
export const snapshotSchema = z.object({ id: z.string().uuid(), createdAt: z.string().datetime(), source: z.enum(['manual', 'before-restore', 'before-import', 'import', 'before-portrait', 'portrait', 'confirm', 'before-suggestion', 'suggestion']), document: documentSchema }).strict();
export type Snapshot = z.infer<typeof snapshotSchema>;
export const connectionKinds = ['text', 'image', 'mcp'] as const;
export const portraitTaskSummarySchema=z.object({id:z.string().uuid(),documentId:z.string().uuid(),baseRevision:z.number().int().nonnegative(),sourceAssetId:z.string().uuid(),style:z.string().max(40),templateDigest:z.string().regex(/^[a-f0-9]{64}$/).optional(),options:yearbookSchema.pick({presentation:true,outfit:true,hair:true,retouch:true,background:true}),phase:z.enum(['waiting','receiving','decoding','succeeded','failed','cancelled']),startedAt:z.number(),expiresAt:z.number()}).strict();
export const sessionSchema = z.object({ csrfToken: z.string().length(64), portraitWorkflow:z.enum(['template-v1','template-v2']).optional(), connections: z.object({
        text: z.enum(['unavailable','configured','connected','failed']), image: z.enum(['unavailable','configured','connected','failed']), mcp: z.enum(['disabled','configured','connected','failed'])
    }).strict(),textConnection:z.object({proxyCompatibility:z.boolean().optional(),id:z.string().uuid(),baseUrl:z.string().url().max(2048),model:z.string().max(100)}).strict().optional(),
 imageConnection:z.object({credentialsVerified:z.boolean().optional(),modelListed:z.boolean().optional(),portraitTask:portraitTaskSummarySchema.optional(),check:z.object({network:z.string(),generation:z.string(),download:z.string(),referenceCount:z.union([z.literal(1),z.literal(2)]).optional()}).strict().optional(),pendingDownload:z.object({id:z.string().uuid(),kind:z.enum(['test','portrait']),expiresAt:z.number(),portrait:z.object({requestId:z.string().uuid(),documentId:z.string().uuid(),baseRevision:z.number().int().nonnegative(),sourceAssetId:z.string().uuid(),templateDigest:z.string().regex(/^[a-f0-9]{64}$/).optional(),style:z.string(),options:yearbookSchema.pick({presentation:true,outfit:true,hair:true,retouch:true,background:true})}).strict().optional()}).strict().optional(),provider:z.enum(['openai','qwen','seedream']).optional(),size:z.enum(['1024x1024','2048x2048']).optional(),proxyCompatibility:z.boolean().optional(),resultProxyCompatibility:z.boolean().optional(),id:z.string().uuid(),baseUrl:z.string().url().max(2048),model:z.string().max(100),capabilities:z.object({single:z.boolean(),multiple:z.boolean()}).strict()}).strict().optional(),
 mcpConnection:z.object({id:z.string().uuid(),baseUrl:z.string().url().max(2048),manifest:toolManifestSchema.optional(),approved:z.array(z.string()).max(30),roundId:z.string().uuid(),remaining:z.number().int().min(0).max(5)}).strict().optional() }).strict();
export function emptyDocument(): ResumeDocument {
    return documentSchema.parse({ schemaVersion: 1, id: crypto.randomUUID(), revision: 0, updatedAt: new Date().toISOString(), confirmedRevision: null,
        basic: { name: '', englishName: '', role: '', phone: '', email: '', location: '', showPhone: true, showEmail: true },
        sections: sectionIds.map(id => ({ id, text: '', sourceRefs: [] })), sourceText: '', uncertainties: [],
        presentation: { styleId: 'editorial', layoutId: 'single', reading: Reading.normalize(null) },
        portrait: { originalAssetId: null, appliedAssetId: null, crop: null, yearbook: Yearbook.normalize() } });
}
export function editDocument(current: ResumeDocument, change: (copy: ResumeDocument) => void): ResumeDocument {
    const next = structuredClone(current);
    const inheritedFormatting=new Map(next.sections.map(section=>[section.id,section.formatting]));
    change(next);
    for(const section of next.sections)if(section.text!==current.sections.find(s=>s.id===section.id)!.text){delete section.highlights;if(section.formatting===inheritedFormatting.get(section.id))delete section.formatting;}
    next.revision = current.revision + 1;
    next.updatedAt = new Date().toISOString();
    next.confirmedRevision = null;
    return documentSchema.parse(next);
}
export function readingContent(doc: ResumeDocument): Record<string, string> {
    const result: Record<string, string> = {};
    for (const section of doc.sections)
        result[section.id === 'work' ? 'achievement' : section.id] = section.text;
    return result;
}
export function visibleSections(doc: ResumeDocument) {
    const ids = Reading.visible(doc.presentation.reading, readingContent(doc));
    const primary = Reading.primary(doc.presentation.reading, readingContent(doc));
    const ordered = primary ? [primary, ...ids.filter(id => id !== primary)] : ids;
    return [...ordered, 'unknown'].flatMap(id => doc.sections.filter(s => s.id === id && s.text.trim()));
}

export function confirmationIssue(doc: ResumeDocument): string {
    if (!doc.basic.name.trim()) return '请先核对并填写姓名。';
    if (!visibleSections(doc).length) return '请至少展示一个有内容的经历栏目后再确认。';
    return '';
}
