import { zipSync,strToU8 } from 'fflate';
import { writeFileSync } from 'node:fs';
const escape=value=>value.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');
const expected=[];
for(let i=1;i<=20;i++){
    const graduate=i<=6,experienced=i>6&&i<=12,long=i%4===0;
    const lines=[`姓名：虚构测试${i}`,`求职方向：${graduate?'应届内容运营':experienced?'项目管理':'测试岗位'}`,`邮箱：fictional-${i}@example.com`,graduate?'教育背景':'工作经历',graduate?'虚构示范大学 本科 2022—2026':'虚构示范公司 2021—2025',`仅测试成果编号 ${i}，不代表真实经历。`,'项目经历',...(long?Array.from({length:120},(_,n)=>`虚构项目段落 ${n+1}：整理测试材料并核对原文，不补造事实。\n第二行保留原数字 ${n+1}。`):['虚构项目：记录需求、整理资料、核对输出。']),'未知栏目','保留：<script>FICTIONAL_INJECTION</script>；不访问 http://127.0.0.1/。'];
    const xml=`<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${lines.map(line=>`<w:p><w:r><w:t xml:space="preserve">${escape(line)}</w:t></w:r></w:p>`).join('')}<w:sectPr>${i%2===0?'<w:cols w:num="2"/>':''}</w:sectPr></w:body></w:document>`;
    const bytes=zipSync({'[Content_Types].xml':strToU8('<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>'),'_rels/.rels':strToU8('<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>'),'word/document.xml':strToU8(xml)});
    const name=`fictional-${String(i).padStart(2,'0')}.docx`;writeFileSync(new URL(name,import.meta.url),bytes);expected.push({file:name,lines,name:`虚构测试${i}`,long,stage:graduate?'graduate':experienced?'experienced':'custom'});
}
writeFileSync(new URL('expected.json',import.meta.url),JSON.stringify(expected,null,2)+'\n');
console.log('Generated 20 fictional DOCX fixtures and expected.json; no real personal data.');
