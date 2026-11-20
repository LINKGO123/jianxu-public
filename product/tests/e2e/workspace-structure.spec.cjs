const fs=require('node:fs'),path=require('node:path');
const {test,expect,run,upload,step,saved,state,synthetic,aiMock,connect,openPortraitOptions,confirm}=require('./fixtures.cjs');
const beauty=page=>page.getByRole('region',{name:'排版与形象工作区',exact:true});

for(const [width,height] of [[1280,800],[1440,900],[1024,768]])test(`WS01/02/03/05/07 ${width} desktop workspace and observation state`,async({page})=>{
 await page.setViewportSize({width,height});await upload(page,'fictional-01.docx','虚构测试1',false);await saved(page);
 const work=page.locator('#content-work'),group=page.locator('.section-editor').filter({has:work});
 await expect(group).not.toHaveAttribute('open');const before=(await state(page)).document;
 await group.locator(':scope > summary').click();await expect(work).toBeVisible();
 await group.locator(':scope > summary').click();expect((await state(page)).document).toEqual(before);
 await group.locator(':scope > summary').click();await work.fill('虚构公司 2022—2026\n岗位：测试工程师\n完成虚构事实，不补造真实经历。');await saved(page);
 await page.locator('#content-unknown').focus();await page.locator('#content-unknown').scrollIntoViewIfNeeded();
 const next=page.locator('.content-workspace > .workspace-actions').getByRole('button',{name:'去排版美化 →',exact:true});
 const box=await next.boundingBox();expect(box.y).toBeGreaterThanOrEqual(68);expect(box.y+box.height).toBeLessThan(height);
 await next.click();await expect(beauty(page).getByText('预览已更新',{exact:true})).toBeVisible();await page.evaluate(()=>scrollTo(0,0));
 const metrics=await page.evaluate(()=>({width:innerWidth,height:innerHeight,paper:document.querySelector('.page-viewport figure').getBoundingClientRect().toJSON(),preview:document.querySelector('.preview-panel').getBoundingClientRect().toJSON(),settings:document.querySelector('.beauty-options').getBoundingClientRect().toJSON(),scrollWidth:document.documentElement.scrollWidth}));
 fs.writeFileSync(path.join(run,`workspace-${width}.json`),JSON.stringify(metrics,null,2));
 expect(metrics.scrollWidth).toBeLessThanOrEqual(width);expect(metrics.preview.right).toBeLessThanOrEqual(metrics.settings.left);
 if(width>=1280)expect(metrics.paper.y).toBeLessThanOrEqual(360);
 await expect(beauty(page).getByRole('button',{name:'检查并生成 →',exact:true})).toHaveClass(/primary-button/);
 await page.screenshot({path:path.join(run,'screenshots',`workspace-${width}.png`)});
 const revision=(await state(page)).document.revision;
 await page.getByRole('navigation',{name:'美化配置'}).getByRole('button',{name:'排版',exact:true}).click();
 await beauty(page).getByText('间距与页边距',{exact:true}).click();await beauty(page).getByRole('combobox',{name:'段间距（pt）',exact:true}).selectOption('12');await saved(page);
 expect((await state(page)).document.revision).toBeGreaterThan(revision);await expect(beauty(page).getByText('预览已更新',{exact:true})).toBeVisible();
 await page.setViewportSize({width:1440,height:900});await page.setViewportSize({width,height});
 await expect(beauty(page).getByRole('combobox',{name:'段间距（pt）',exact:true})).toHaveValue('12');
 await beauty(page).getByRole('button',{name:'修改内容',exact:true}).click();await expect(page.locator('#content-unknown')).toBeFocused();
 await page.locator('.bottom-action').getByRole('button',{name:'去排版美化 →',exact:true}).click();await expect(beauty(page)).toBeVisible();
});

test('WS04 photo grouping stays local and preserves an in-flight candidate while collapsed',async({page,context})=>{
 test.setTimeout(90000);const mock=await aiMock(context);await upload(page);await connect(page,'image');await step(page,'排版与形象');
 await page.getByRole('navigation',{name:'美化配置'}).getByRole('button',{name:'照片',exact:true}).click();
 const studio=page.locator('.portrait-studio'),options=studio.locator('.portrait-ai-options');await expect(options).not.toHaveAttribute('open');await page.screenshot({path:path.join(run,'screenshots','workspace-photo-entry.png')});
 await beauty(page).getByRole('button',{name:'上传 / 裁切照片',exact:true}).click();await page.getByLabel(/上传照片 \/ 页面截图/).setInputFiles({name:'fictional-ws.png',mimeType:'image/png',buffer:synthetic()});
 await page.getByRole('button',{name:'应用原照裁切',exact:true}).click();await expect(page.getByRole('dialog')).not.toBeVisible();await saved(page);const doc=(await state(page)).document;
 await openPortraitOptions(page);await expect(studio.locator('.portrait-directions button')).toHaveCount(10);
 await studio.getByRole('button',{name:/韩式学年照 · 女生/}).click();await studio.getByLabel(/允许发送以上图片/).check();mock.mode='late';
 await studio.getByRole('button',{name:'生成AI候选 · 不自动应用',exact:true}).click();await expect.poll(()=>mock.calls.portrait).toBe(1);
 await options.locator(':scope > summary').click();await step(page,'整理内容');await step(page,'排版与形象');await expect(options).not.toHaveAttribute('open');
 await openPortraitOptions(page);await expect(studio.getByRole('combobox',{name:'呈现方向',exact:true})).toHaveValue('female');expect(mock.calls.portrait).toBe(1);expect((await state(page)).document).toEqual(doc);
 await studio.getByRole('button',{name:'取消接收候选',exact:true}).click();await page.screenshot({path:path.join(run,'screenshots','workspace-photo.png')});
});

test('WS02 returning to a collapsed empty section opens it without invalidating confirmation',async({page})=>{
 await upload(page,'fictional-01.docx','虚构测试1',false);await saved(page);await page.screenshot({path:path.join(run,'screenshots','workspace-content-default.png')});
 await confirm(page);await saved(page);const before=(await state(page)).document;
 await step(page,'整理内容');const work=page.locator('#content-work'),group=page.locator('.section-editor').filter({has:work});await group.locator(':scope > summary').click();await expect(group).not.toHaveAttribute('open');
 await page.locator('.content-workspace > .workspace-actions').getByRole('button',{name:'去排版美化 →',exact:true}).click();await page.getByRole('navigation',{name:'美化配置'}).getByRole('button',{name:'排版',exact:true}).click();
 const panel=page.locator('.layout-settings');await panel.getByText('返回栏目编辑与重点',{exact:true}).click();await panel.getByRole('button',{name:'编辑所选栏目与重点',exact:true}).click();
 await expect(work).toBeFocused();await expect(group).toHaveAttribute('open');expect((await state(page)).document).toEqual(before);
});

test('WS06 history shows snapshot identities and survives a protected restore',async({page})=>{
 await upload(page);await page.getByLabel('求职方向',{exact:true}).fill('虚构岗位甲');await saved(page);await step(page,'排版与形象');
 await page.getByRole('button',{name:'保存当前版本',exact:true}).click();await saved(page);await step(page,'整理内容');await page.getByLabel('姓名',{exact:true}).fill('虚构稿乙');await page.getByLabel('求职方向',{exact:true}).fill('虚构岗位乙');await saved(page);
 await page.getByRole('button',{name:/历史记录 \(/}).click();const first=page.locator('.history-item').filter({hasText:'虚构岗位甲'}).first();
 await expect(first).toContainText('虚构测试1');await first.getByRole('button',{name:'恢复（先备份当前）',exact:true}).click();await saved(page);
 const after=await state(page);expect(after.document.basic.role).toBe('虚构岗位甲');expect(after.history.some(s=>s.source==='before-restore'&&s.document.basic.name==='虚构稿乙'&&s.document.basic.role==='虚构岗位乙')).toBe(true);
 await expect(page.locator('.history-item').filter({hasText:'虚构岗位乙'})).toBeVisible();await page.screenshot({path:path.join(run,'screenshots','workspace-history.png')});
});
