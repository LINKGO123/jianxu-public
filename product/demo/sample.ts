import { emptyDocument, type SectionId } from '../shared/schemas.js';

const sampleContent = {
    summary: '负责内容规划与协作交付，擅长把用户反馈整理成可执行的编辑计划。',
    work: '示例工作室 · 内容运营 | 2023—2025\n1. 建立选题与发布台账，协调设计和编辑按周交付。\n2. 整理栏目阅读反馈，为后续选题提供依据。',
    project: '社区通讯改版 | 2024\n梳理信息分类，补充导览与归档说明，整理读者反馈并完成两轮迭代。',
    education: '示例大学 · 新闻传播学 | 2019—2023',
} satisfies Partial<Record<SectionId, string>>;

export const sampleSections = new Map(Object.entries(sampleContent));

export function fictionalResume() {
    const document = emptyDocument();
    document.basic.name = '周见山（虚构）';
    document.basic.role = '内容运营';
    document.basic.location = '杭州';
    for (const section of document.sections) section.text = sampleSections.get(section.id) ?? '';
    return document;
}
