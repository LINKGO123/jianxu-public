const path=require('node:path');
const {test,expect,run,upload,saved,state,step,preview,synthetic,aiMock,connect,confirm,download}=require('./fixtures.cjs');
const work='虚构科技有限公司 2021/3—2025/6 培训主管\n公司介绍：只用于测试的虚构机构。\n项目一：课程开发\n1. 需求分析：完成12次虚构访谈。\n2. 项目成果：覆盖100位虚构学员。';

test('R11: editable reading hierarchy preserves facts, persists and clears obsolete line corrections',async({page})=>{
 await upload(page);await page.getByRole('textbox',{name:/^工作经历/}).fill(work);await saved(page);
 await page.getByText('调整工作经历分组',{exact:true}).click();
 const control=page.getByRole('combobox',{name:'工作经历第3行分组',exact:true});await expect(control).toHaveValue('auto');await control.selectOption('body');await saved(page);
 expect((await state(page)).document.sections.find(s=>s.id==='work')).toMatchObject({text:work,formatting:[{line:2,kind:'body'}]});
 await page.reload();await saved(page);await page.getByText('调整工作经历分组',{exact:true}).click();await expect(control).toHaveValue('body');
 await page.getByRole('textbox',{name:/^工作经历/}).fill(work+'\n保留新增事实。');await saved(page);expect((await state(page)).document.sections.find(s=>s.id==='work').formatting).toBeUndefined();
 await step(page,'排版与形象');await page.getByRole('navigation',{name:'美化配置'}).getByRole('button',{name:'排版',exact:true}).click();await page.getByRole('button',{name:'使用单栏阅读版（推荐长履历）',exact:true}).click();await saved(page);await preview(page);
 await page.screenshot({path:path.join(run,'screenshots/reading-preview.png'),fullPage:true});
 await confirm(page);expect((await download(page,'reading-hierarchy')).length).toBeGreaterThan(0);
});

test('R12: reference crop stays local, two images are visible and repeated generation defaults to original crop',async({page,context})=>{
 const mock=await aiMock(context);await upload(page);await connect(page,'image');await preview(page);
 await page.getByRole('navigation',{name:'美化配置'}).getByRole('button',{name:'照片',exact:true}).click();await page.getByRole('button',{name:'上传 / 裁切照片',exact:true}).click();await page.getByLabel(/上传照片 \/ 页面截图/).setInputFiles({name:'original.png',mimeType:'image/png',buffer:synthetic()});await expect(page.getByRole('button',{name:'应用原照裁切',exact:true})).toBeEnabled();await page.getByRole('button',{name:'应用原照裁切',exact:true}).click();await expect(page.getByRole('dialog')).not.toBeVisible();await saved(page);
 const before=await state(page),cropId=before.document.portrait.appliedAssetId,studio=page.locator('.portrait-studio');
 await studio.getByRole('button',{name:/韩式学年照 · 女生/}).click();await expect(studio.getByRole('combobox',{name:'发型',exact:true})).toHaveValue('styled');
 await studio.getByLabel(/可选风格参考图/).setInputFiles({name:'style.png',mimeType:'image/png',buffer:synthetic()});
 await expect(page.getByRole('button',{name:'使用此风格参考裁切',exact:true})).toBeEnabled();await page.getByRole('slider').press('ArrowRight');await page.getByRole('button',{name:'使用此风格参考裁切',exact:true}).click();await expect(page.getByRole('dialog')).not.toBeVisible();
 expect((await state(page)).document).toEqual(before.document);
 await expect(studio.getByRole('img',{name:'本人照片 · 本次生成依据',exact:true})).toBeVisible();await expect(studio.getByRole('img',{name:/风格参考图 · 服装、背景、布光/})).toBeVisible();
 await studio.getByLabel(/允许发送以上图片/).check();await studio.getByRole('button',{name:'生成AI候选 · 不自动应用',exact:true}).click();await expect(studio.getByRole('img',{name:'AI候选 · 未确认，不进入简历',exact:true})).toBeVisible();
 const first=mock.requests.find(r=>r.images);expect(first.images).toHaveLength(2);expect(first.sourceAssetId).toBe(cropId);expect(first.options).toMatchObject({presentation:'female',hair:'styled',retouch:'light'});
 await studio.getByRole('button',{name:'我已核对本人特征，确认应用候选',exact:true}).click();await saved(page);await expect.poll(async()=> (await state(page)).document.portrait.appliedAssetId).not.toBe(cropId);
 await expect(studio.getByLabel(/允许发送以上图片/)).not.toBeChecked();await studio.getByLabel(/允许发送以上图片/).check();await studio.getByRole('button',{name:'生成AI候选 · 不自动应用',exact:true}).click();await expect.poll(()=>mock.calls.portrait).toBe(2);expect(mock.requests.filter(r=>r.images)[1].sourceAssetId).toBe(cropId);
 await expect(studio.getByRole('button',{name:'放弃候选，保留当前照片',exact:true})).toBeVisible();await studio.getByRole('button',{name:'放弃候选，保留当前照片',exact:true}).click();
 await studio.getByRole('combobox',{name:'生成依据',exact:true}).selectOption('current');await expect(studio.getByLabel(/允许发送以上图片/)).not.toBeChecked();
});
