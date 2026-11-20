import test from 'node:test';
import assert from 'node:assert/strict';
import {wrapText} from '../client/render/pages.js';

test('CJK closing punctuation stays with preceding text without dropping content or exceeding line width',()=>{
 const measure=(value:string)=>Array.from(value).length*10;
 for(const value of ['测试文字。后续内容','这是内容，后续说明。','Word123456789。后续说明','测试内容！？后续文字','测试文字）后续内容','增长65%以上','增长65％以上']){
  const lines=wrapText(value,40,measure);
  assert.equal(lines.join(''),value);
  assert.ok(lines.every(line=>measure(line)<=40));
  assert.ok(lines.every(line=>!/^[，。！？；：、）】》」』”’%％]/.test(line)),JSON.stringify(lines));
 }
 assert.deepEqual(wrapText('原文。\n手工换行',60,measure),['原文。','手工换行']);
 const punctuationRun='文字'+ '。'.repeat(20);
 const narrow=wrapText(punctuationRun,20,measure);
 assert.equal(narrow.join(''),punctuationRun);
 assert.ok(narrow.every(line=>measure(line)<=20));
});
