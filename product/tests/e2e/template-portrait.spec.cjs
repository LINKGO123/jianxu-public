const path=require('node:path');
const {test,expect,run,upload,saved,state,preview,synthetic,aiMock,connect}=require('./fixtures.cjs');
async function prepare(page,context){
 const mock=await aiMock(context);await upload(page);await connect(page,'image');await preview(page);
 await page.getByRole('navigation',{name:'美化配置'}).getByRole('button',{name:'照片',exact:true}).click();await page.getByRole('button',{name:'上传 / 裁切照片',exact:true}).click();await page.getByLabel(/上传照片 \/ 页面截图/).setInputFiles({name:'fictional-original.png',mimeType:'image/png',buffer:synthetic()});
 await page.getByRole('button',{name:'应用原照裁切',exact:true}).click();await expect(page.getByRole('dialog')).not.toBeVisible();await saved(page);return mock;
}
test('R13: template requires original and template, comparison is local, explicit adoption retains template after reload',async({page,context})=>{
 const mock=await prepare(page,context),studio=page.locator('.portrait-studio'),before=await state(page);
 await studio.getByRole('button',{name:/固定模板 · 女生/}).click();await expect(studio.getByRole('combobox',{name:'发型',exact:true})).toHaveCount(0);
 const generate=studio.getByRole('button',{name:'生成AI候选 · 不自动应用',exact:true});await studio.getByLabel(/允许发送以上图片/).check();await expect(generate).toBeDisabled();
 await studio.getByLabel(/固定造型模板（必选/).setInputFiles({name:'fictional-template.png',mimeType:'image/png',buffer:synthetic()});await page.getByRole('button',{name:'使用此风格参考裁切',exact:true}).click();await expect(page.getByRole('dialog')).not.toBeVisible();
 await expect(studio.getByLabel(/允许发送以上图片/)).not.toBeChecked();await studio.getByText('本地精修与构图核对（可选）',{exact:true}).click();await expect(studio.getByText('构图核对 · 非换脸结果',{exact:true})).toBeVisible();
 await studio.getByRole('slider',{name:'原照叠层透明度',exact:true}).fill('0.2');expect(mock.calls.portrait).toBe(0);expect((await state(page)).document).toEqual(before.document);
 await page.screenshot({path:path.join(run,'screenshots/template-composition.png'),fullPage:true});
 await studio.getByLabel(/允许发送以上图片/).check();await generate.click();await expect(studio.getByRole('img',{name:'AI候选 · 未确认，不进入简历',exact:true})).toBeVisible();
 const request=mock.requests.find(r=>r.images);expect(request.style).toBe('template-female');expect(request.images).toHaveLength(2);expect(request.templateDigest).toMatch(/^[a-f0-9]{64}$/);expect(request.sourceAssetId).toBe(before.document.portrait.appliedAssetId);expect((await state(page)).document).toEqual(before.document);
 await studio.getByRole('button',{name:'我已核对本人特征，确认应用候选',exact:true}).click();await expect.poll(async()=> (await state(page)).assets.filter(a=>a.kind==='template').length).toBe(1);
 const adopted=await state(page),ai=adopted.assets.find(a=>a.id===adopted.document.portrait.appliedAssetId);expect(ai.templateId).toBe(adopted.assets.find(a=>a.kind==='template').id);expect(adopted.document.confirmedRevision).toBeNull();
 await page.reload();await preview(page);await expect(studio.getByRole('img',{name:'当前已采用照片的造型模板 · 本地保留',exact:true})).toBeVisible();expect((await state(page)).document).toEqual(adopted.document);
 await studio.getByRole('button',{name:/固定模板 · 男生/}).click();await expect(studio.getByRole('img',{name:/造型模板 · 保留头发/})).toHaveCount(0);await expect(studio.getByLabel(/允许发送以上图片/)).not.toBeChecked();expect(mock.calls.portrait).toBe(1);
});
test('R14: old server never receives a chargeable template request',async({page,context})=>{
 const mock=await prepare(page,context);
 await context.route('**/api/session',async route=>{const response=await route.fetch(),d=await response.json();d.portraitWorkflow='template-v1';if(d.imageConnection){d.connections.image='connected';d.imageConnection.capabilities={single:true,multiple:true};}await route.fulfill({response,json:d});});
 await page.reload();await preview(page);const studio=page.locator('.portrait-studio');await studio.getByRole('button',{name:/固定模板 · 男生/}).click();await expect(studio.getByText(/本机服务尚未加载固定模板功能/)).toBeVisible();
 await studio.getByLabel(/固定造型模板（必选/).setInputFiles({name:'fictional-template.png',mimeType:'image/png',buffer:synthetic()});await page.getByRole('button',{name:'使用此风格参考裁切',exact:true}).click();await expect(page.getByRole('dialog')).not.toBeVisible();await studio.getByLabel(/允许发送以上图片/).check();
 await expect(studio.getByRole('button',{name:'生成AI候选 · 不自动应用',exact:true})).toBeDisabled();expect(mock.calls.portrait).toBe(0);
});

test('R15: local eye alignment is editable, makes no AI call, leaves draft intact and only sends prepared template after consent',async({page,context})=>{
 const mock=await prepare(page,context),studio=page.locator('.portrait-studio');await studio.getByRole('button',{name:/固定模板 · 女生/}).click();
 await studio.getByLabel(/固定造型模板（必选/).setInputFiles({name:'fictional-template.png',mimeType:'image/png',buffer:synthetic()});await page.getByRole('button',{name:'使用此风格参考裁切',exact:true}).click();await expect(page.getByRole('dialog')).not.toBeVisible();const before=await state(page);
 await studio.getByText('本地精修与构图核对（可选）',{exact:true}).click();await studio.getByRole('button',{name:'本人面部对齐与预合成（本地）',exact:true}).click();const dialog=page.getByRole('dialog');await expect(dialog.getByRole('heading',{name:'先对齐本人面部，再整理衔接',exact:true})).toBeVisible();
 const save=dialog.getByRole('button',{name:'使用这张本地预合成 · 不发起生图',exact:true});await expect(save).toBeEnabled();
 await dialog.getByRole('spinbutton',{name:'本人左眼横向 (%)',exact:true}).fill('64');await expect(dialog.getByRole('alert')).toHaveText(/从左到右/);await expect(save).toBeDisabled();
 await dialog.getByRole('spinbutton',{name:'本人左眼横向 (%)',exact:true}).fill('38');await expect(save).toBeEnabled();
 await page.screenshot({path:path.join(run,'screenshots/local-face-alignment.png'),fullPage:true});await save.click();await expect(dialog).not.toBeVisible();
 expect(mock.calls.portrait).toBe(0);expect((await state(page)).document).toEqual(before.document);await expect(studio.getByText(/当前发送的是本地面部预合成模板/)).toBeVisible();await expect(studio.getByLabel(/允许发送以上图片/)).not.toBeChecked();
 await studio.getByLabel(/允许发送以上图片/).check();await studio.getByRole('button',{name:'生成AI候选 · 不自动应用',exact:true}).click();await expect(studio.getByRole('img',{name:'AI候选 · 未确认，不进入简历',exact:true})).toBeVisible();expect(mock.calls.portrait).toBe(1);expect(mock.requests.find(r=>r.images).images).toHaveLength(2);
});


test('R16: restoring original face after AI stays local, needs adoption and survives reload',async({page,context})=>{
 const mock=await prepare(page,context),studio=page.locator('.portrait-studio');await studio.getByRole('button',{name:/韩式学年照 · 女生/}).click();await studio.getByLabel(/允许发送以上图片/).check();await studio.getByRole('button',{name:'生成AI候选 · 不自动应用',exact:true}).click();await expect(studio.getByRole('img',{name:'AI候选 · 未确认，不进入简历',exact:true})).toBeVisible();const before=await state(page);
 await studio.getByText('候选本地精修（可选）',{exact:true}).click();await studio.getByRole('button',{name:'最后回贴原脸（本地，不再调用AI）',exact:true}).click();const dialog=page.getByRole('dialog');await expect(dialog.getByRole('heading',{name:'最后回贴原脸 · 不再发送AI',exact:true})).toBeVisible();await expect(dialog.getByRole('button',{name:'使用原脸回贴候选 · 不调用AI',exact:true})).toBeEnabled();await dialog.getByRole('button',{name:'使用原脸回贴候选 · 不调用AI',exact:true}).click();await expect(dialog).not.toBeVisible();
 expect(mock.calls.portrait).toBe(1);expect((await state(page)).document).toEqual(before.document);await expect(studio.getByText(/这张候选已最后回贴本人原脸/)).toBeVisible();await studio.getByRole('button',{name:'我已核对本人特征，确认应用候选',exact:true}).click();await expect.poll(async()=> (await state(page)).assets.some(a=>a.faceRestored)).toBe(true);
 await page.reload();await preview(page);await expect(studio.getByText('当前已采用照片保留了本地原脸回贴结果。',{exact:true})).toBeVisible();expect(mock.calls.portrait).toBe(1);
});


test('R17: locally recovered candidate needs adoption, keeps original ancestry and persists without generating',async({page,context})=>{
 const mock=await prepare(page,context),studio=page.locator('.portrait-studio'),before=await state(page);
 await studio.getByLabel(/找回已下载的AI候选/).setInputFiles({name:'saved-candidate.png',mimeType:'image/png',buffer:synthetic()});
 await expect(studio.getByRole('img',{name:'AI候选 · 未确认，不进入简历',exact:true})).toBeVisible();
 expect((await state(page)).document).toEqual(before.document);expect(mock.calls.portrait).toBe(0);
 await studio.getByRole('button',{name:'我已核对本人特征，确认应用候选',exact:true}).click();
 await expect.poll(async()=> (await state(page)).assets.some(a=>a.kind==='ai')).toBe(true);
 const after=await state(page);expect(after.document.portrait.originalAssetId).toBe(before.document.portrait.originalAssetId);
 expect(after.assets.find(a=>a.id===after.document.portrait.appliedAssetId).parentId).toBe(before.document.portrait.originalAssetId);
 await page.reload();await preview(page);await expect(studio.getByRole('img',{name:'当前已确认照片/原照裁切',exact:true})).toBeVisible();expect((await state(page)).document.portrait.appliedAssetId).toBe(after.document.portrait.appliedAssetId);expect(mock.calls.portrait).toBe(0);
});
