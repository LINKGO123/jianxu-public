const path=require('node:path');
const {test,expect,run,step,upload,saved,state,preview,confirm,download}=require('./fixtures.cjs');

test('U09: plain header prefill and PDF page photo crop stay local and survive reload',async({page})=>{
 await upload(page,'fictional-header-photo.pdf','林安然');
 await expect(page.getByLabel('手机号（可选）',{exact:true})).toHaveValue('13800000000');
 await expect(page.getByLabel('邮箱（可选）',{exact:true})).toHaveValue('fictional@example.com');
 await expect(page.getByRole('textbox',{name:/^教育背景/})).toHaveValue('本科（全日制）-毕业于2020.6');
 await expect(page.getByRole('textbox',{name:/^证书与荣誉/})).toHaveValue('虚构证书');
 await step(page,'排版与形象');await page.getByRole('navigation',{name:'美化配置'}).getByRole('button',{name:'照片',exact:true}).click();await page.getByRole('button',{name:'上传 / 裁切照片',exact:true}).click();
 await page.getByText('从简历PDF首页裁切头像',{exact:true}).click();
 let release,entered=false;const gate=new Promise(resolve=>{release=resolve;});
 await page.route('**/assets/pdf-page-*.js',async route=>{entered=true;await gate;await route.continue();});
 await page.getByRole('button',{name:'使用刚上传的PDF首页',exact:true}).click();
 await expect.poll(()=>entered).toBe(true);await page.getByRole('button',{name:'取消读取首页',exact:true}).click();release();
 await expect(page.getByRole('button',{name:'使用刚上传的PDF首页',exact:true})).toBeEnabled();
 await expect(page.getByRole('button',{name:'应用原照裁切',exact:true})).toBeDisabled();
 await page.unroute('**/assets/pdf-page-*.js');
 await page.getByRole('button',{name:'使用刚上传的PDF首页',exact:true}).click();
 await expect(page.getByRole('button',{name:'应用原照裁切',exact:true})).toBeEnabled();
 await page.getByRole('slider').press('End');const crop=page.getByLabel(/照片裁切，拖动/);
 for(let i=0;i<31;i++)await crop.press('Shift+ArrowLeft');for(let i=0;i<41;i++)await crop.press('Shift+ArrowDown');
 const center=await crop.evaluate(c=>Array.from(c.getContext('2d').getImageData(180,240,1,1).data));expect(center[0]).toBeGreaterThan(center[2]);
 await page.screenshot({path:path.join(run,'screenshots/pdf-photo-editor.png')});
 await page.getByRole('button',{name:'应用原照裁切',exact:true}).click();await expect(page.getByRole('dialog')).not.toBeVisible();await saved(page);
 const before=(await state(page)).document.portrait;expect(before.appliedAssetId).toBeTruthy();
 await page.reload();await saved(page);expect((await state(page)).document.portrait).toEqual(before);
 await page.getByRole('navigation',{name:'美化配置'}).getByRole('button',{name:'照片',exact:true}).click();await page.getByRole('button',{name:'上传 / 裁切照片',exact:true}).click();await page.getByText('从简历PDF首页裁切头像',{exact:true}).click();
 await expect(page.getByRole('button',{name:'使用刚上传的PDF首页',exact:true})).toHaveCount(0);
 await page.getByLabel('选择PDF读取首页',{exact:true}).setInputFiles({name:'invalid.pdf',mimeType:'application/pdf',buffer:Buffer.from('not a pdf')});
 await expect(page.getByRole('alert')).toContainText('签名');await expect(page.getByRole('button',{name:'应用原照裁切',exact:true})).toBeEnabled();
 await page.getByRole('button',{name:'关闭照片编辑',exact:true}).click();
});

test('U10: compact pages preserve facts, invalidate confirmation, persist and actually download',async({page})=>{
 await upload(page,'fictional-04.docx','虚构测试4');await saved(page);await preview(page);
 const original=(await state(page)).document.sections,normal=await page.getByRole('img',{name:/^当前简历第/}).count(),normalPixels=await page.getByRole('img',{name:/^当前简历第/}).first().screenshot();
 await step(page,'排版与形象');await page.getByRole('navigation',{name:'美化配置'}).getByRole('button',{name:'排版',exact:true}).click();await page.getByRole('combobox',{name:'排版密度',exact:true}).selectOption('compact');await saved(page);await step(page,'整理内容');await preview(page);
 expect(await page.getByRole('img',{name:/^当前简历第/}).count()).toBeLessThanOrEqual(normal);expect((await page.getByRole('img',{name:/^当前简历第/}).first().screenshot()).equals(normalPixels)).toBe(false);expect((await state(page)).document.sections).toEqual(original);
 await page.reload();await saved(page);expect((await state(page)).document.presentation.density).toBe('compact');
 await step(page,'确认生成');await confirm(page);const files=await download(page,'compact-actual');expect(files.length).toBeGreaterThan(0);
 await step(page,'排版与形象');await page.getByRole('navigation',{name:'美化配置'}).getByRole('button',{name:'排版',exact:true}).click();await page.getByRole('combobox',{name:'排版密度',exact:true}).selectOption('comfortable');await saved(page);await step(page,'确认生成');
 await expect(page.getByRole('button',{name:'生成可下载 PNG',exact:true})).toBeDisabled();
});
