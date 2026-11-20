const path=require('node:path');
const {test,expect,run,upload,preview,synthetic,aiMock,state,confirm,download}=require('./fixtures.cjs');
async function configure(page,mock){
 await page.getByRole('button',{name:'AI 助手设置',exact:true}).click();const card=page.getByRole('region',{name:'照片助手',exact:true});
 await card.getByRole('combobox',{name:'选择图片服务',exact:true}).selectOption('seedream');
 await expect(card.getByRole('combobox',{name:'Seedream版本',exact:true})).toHaveValue('doubao-seedream-5-0-pro-260628');await expect(card.getByLabel('方舟模型 / 接入点 ID',{exact:true})).toHaveCount(0);
 await card.getByText('其他服务与高级设置',{exact:true}).click();await card.getByLabel('使用本机 VPN／代理兼容模式',{exact:true}).check();
 await card.getByRole('button',{name:'只检查网络 · 不需要密钥 · 不计费',exact:true}).click();await expect(card.getByRole('status')).toHaveText(/网络预检查通过/);expect(mock.calls.test).toBe(0);
 await card.getByLabel('诊断双图参考（一次可能计费请求）',{exact:true}).check();
 await card.getByPlaceholder('粘贴服务提供方给你的密钥').fill('FICTIONAL_E2E_KEY');
 await card.getByRole('button',{name:'连接并验证密钥 · 不生图',exact:true}).click();await expect(card.getByText('密钥已验证',{exact:true})).toBeVisible();expect(mock.calls.test).toBe(0);
 return card;
}
test('R18 Seedream settings: free credential verification, independent VPN config and reload without generation',async({page,context})=>{
 const mock=await aiMock(context);await upload(page);await configure(page,mock);
 await page.reload();await page.getByRole('button',{name:'AI 助手设置',exact:true}).click();const card=page.getByRole('region',{name:'照片助手',exact:true});await expect(card.getByText(/当前图片服务：豆包 Seedream/)).toBeVisible();
 await card.getByText('更换服务或修改连接',{exact:true}).click();await expect(card.getByRole('combobox',{name:'选择图片服务',exact:true})).toHaveValue('seedream');
 await card.getByText('其他服务与高级设置',{exact:true}).click();await expect(card.getByLabel('使用本机 VPN／代理兼容模式',{exact:true})).toBeChecked();await expect(card.getByPlaceholder('粘贴服务提供方给你的密钥')).toHaveValue('');
 await page.screenshot({path:path.join(run,'screenshots/seedream-settings.png'),fullPage:true});
});

test('R23 Flash and Pro switch uses the saved server key without paid checks, resets capabilities and survives reload',async({page,context})=>{
 const mock=await aiMock(context);await upload(page);const card=await configure(page,mock);const switches=[];
 await context.route('**/api/connections/image/model',async route=>{expect(route.request().method()).toBe('PATCH');switches.push(route.request().postDataJSON());return route.fallback();});
 await card.getByText('更换服务或修改连接',{exact:true}).click();await card.getByRole('combobox',{name:'Seedream版本',exact:true}).selectOption('doubao-seedream-5-0-flash-260915');
 await expect(card.getByPlaceholder('粘贴服务提供方给你的密钥')).toHaveValue('');await expect(card.getByText('Flash · 速度更快、价格更低',{exact:false})).toBeVisible();
 await card.getByRole('button',{name:'切换模型 · 沿用当前密钥 · 不生图',exact:true}).click();await expect(card.getByRole('status')).toHaveText(/已切换模型并沿用当前密钥/);await expect(card.getByText(/当前图片服务：豆包 Seedream · doubao-seedream-5-0-flash/)).toBeVisible();
 expect(mock.calls.test).toBe(0);expect(mock.calls.portrait).toBe(0);expect(Object.keys(switches[0]).sort()).toEqual(['connectionId','model']);
 await page.reload();await page.getByRole('button',{name:'AI 助手设置',exact:true}).click();await card.getByText('更换服务或修改连接',{exact:true}).click();await expect(card.getByRole('combobox',{name:'Seedream版本',exact:true})).toHaveValue('doubao-seedream-5-0-flash-260915');await expect(card.getByPlaceholder('粘贴服务提供方给你的密钥')).toHaveValue('');
 await card.getByText('其他服务与高级设置',{exact:true}).click();await expect(card.getByLabel('使用本机 VPN／代理兼容模式',{exact:true})).toBeChecked();await expect(card.getByText(/已验证能力：单图编辑\s*未验证\s*；双图参考\s*未验证/)).toBeVisible();
 await page.screenshot({path:path.join(run,'screenshots/flash-model-selected.png'),fullPage:true});
 await card.getByRole('combobox',{name:'Seedream版本',exact:true}).selectOption('doubao-seedream-5-0-pro-260628');await card.getByRole('button',{name:'切换模型 · 沿用当前密钥 · 不生图',exact:true}).click();await expect(card.getByRole('status')).toHaveText(/已切换模型并沿用当前密钥/);expect(switches.length).toBe(2);expect(mock.calls.test).toBe(0);expect(mock.calls.portrait).toBe(0);
});
test('R19 Seedream portrait: user path source/template, explicit adoption, PNG export and persisted photo',async({page,context})=>{
 const mock=await aiMock(context);await upload(page);await configure(page,mock);await preview(page);
 await page.getByRole('navigation',{name:'美化配置'}).getByRole('button',{name:'照片',exact:true}).click();await page.getByRole('button',{name:'上传 / 裁切照片',exact:true}).click();await page.getByLabel(/上传照片 \/ 页面截图/).setInputFiles({name:'fictional-original.png',mimeType:'image/png',buffer:synthetic()});await page.getByRole('button',{name:'应用原照裁切',exact:true}).click();await expect(page.getByRole('dialog')).not.toBeVisible();
 const studio=page.locator('.portrait-studio');await studio.getByRole('button',{name:/固定模板 · 女生/}).click();await studio.getByLabel(/固定造型模板（必选/).setInputFiles({name:'fictional-template.png',mimeType:'image/png',buffer:synthetic()});await page.getByRole('button',{name:'使用此风格参考裁切',exact:true}).click();await expect(page.getByRole('dialog')).not.toBeVisible();const before=await state(page);
 await studio.getByLabel(/允许发送以上图片/).check();await studio.getByRole('button',{name:'生成AI候选 · 不自动应用',exact:true}).click();await expect(studio.getByRole('img',{name:'AI候选 · 未确认，不进入简历',exact:true})).toBeVisible();expect(mock.calls.portrait).toBe(1);expect((await state(page)).document).toEqual(before.document);
 await studio.getByRole('button',{name:'我已核对本人特征，确认应用候选',exact:true}).click();await expect.poll(async()=> (await state(page)).assets.some(a=>a.kind==='ai')).toBe(true);const after=await state(page);expect(after.document.sections).toEqual(before.document.sections);expect(after.document.portrait.originalAssetId).toBe(before.document.portrait.originalAssetId);
 await confirm(page);await download(page,'seedream-fictional');await page.reload();expect((await state(page)).document.portrait.appliedAssetId).toBe(after.document.portrait.appliedAssetId);expect(mock.calls.portrait).toBe(1);
});

test('R20 optional dual diagnostic uses one explicitly selected request and settles after response',async({page,context})=>{
 const mock=await aiMock(context);let pending=false,release;const blocked=new Promise(resolve=>{release=resolve;});
 await context.route('**/api/session',async route=>{const response=await route.fetch(),data=await response.json();if(data.imageConnection){if(mock.authorized){data.connections.image='connected';data.imageConnection.credentialsVerified=true;}data.imageConnection.check={network:'passed',generation:pending?'running':'passed',download:pending?'idle':'passed',referenceCount:2};if(!pending&&mock.verified.image){data.connections.image='connected';data.imageConnection.capabilities={single:true,multiple:true};}}await route.fulfill({response,json:data});});
 await context.route('**/api/connections/image/test',async route=>{pending=true;await blocked;pending=false;mock.verified.image=true;mock.calls.test++;await route.fulfill({json:{ok:true}});});
 await upload(page);await page.getByRole('button',{name:'AI 助手设置',exact:true}).click();const card=page.getByRole('region',{name:'照片助手',exact:true});await card.getByRole('combobox',{name:'选择图片服务',exact:true}).selectOption('seedream');await card.getByText('其他服务与高级设置',{exact:true}).click();await card.getByLabel('诊断双图参考（一次可能计费请求）',{exact:true}).check();await card.getByPlaceholder('粘贴服务提供方给你的密钥').fill('FICTIONAL_E2E_KEY');await card.getByRole('button',{name:'连接并验证密钥 · 不生图',exact:true}).click();await expect(card.getByText('密钥已验证',{exact:true})).toBeVisible();await card.getByText('更换服务或修改连接',{exact:true}).click();await card.getByRole('button',{name:'测试所选生图能力 · 可能计费',exact:true}).click();
 await expect(card.getByText(/正在测试双图参考，本次仅一次生图请求/)).toBeVisible();await expect(card.getByText('本轮：双图参考检查',{exact:true})).toBeVisible();await expect(card.getByLabel('照片连接检查进度')).toContainText('图片生成：进行中');await expect(card.getByRole('button',{name:'连接并验证密钥 · 不生图',exact:true})).toBeDisabled();
 release();await expect(card.getByText('密钥已验证',{exact:true})).toBeVisible();await expect(card.getByText(/正在测试双图参考/)).toHaveCount(0);expect(mock.calls.test).toBe(1);
});


test('R21 Seedream task survives leaving preview and returns candidate without a second generation',async({page,context})=>{
 const mock=await aiMock(context);await upload(page);await configure(page,mock);await preview(page);
 await page.getByRole('navigation',{name:'美化配置'}).getByRole('button',{name:'照片',exact:true}).click();await page.getByRole('button',{name:'上传 / 裁切照片',exact:true}).click();await page.getByLabel(/上传照片 \/ 页面截图/).setInputFiles({name:'fictional-original.png',mimeType:'image/png',buffer:synthetic()});await page.getByRole('button',{name:'应用原照裁切',exact:true}).click();await expect(page.getByRole('dialog')).not.toBeVisible();
 const studio=page.locator('.portrait-studio');await studio.getByRole('button',{name:/韩式学年照 · 女生/}).click();await studio.getByLabel(/允许发送以上图片/).check();mock.mode='late';await studio.getByRole('button',{name:'生成AI候选 · 不自动应用',exact:true}).click();await expect(studio.getByText('图片生成任务',{exact:true})).toBeVisible();await expect(studio.getByRole('status')).toHaveText(/等待服务生成/);
 await page.getByRole('button',{name:'AI 助手设置',exact:true}).click();await expect(page.getByRole('heading',{name:'AI 助手设置',exact:true})).toBeVisible();expect(mock.calls.portrait).toBe(1);
 const sent=mock.requests.find(r=>r.images);mock.task.task.phase='succeeded';mock.task.result={requestId:sent.requestId,documentId:sent.documentId,baseRevision:sent.baseRevision,sourceAssetId:sent.sourceAssetId,style:sent.style,image:{base64:synthetic().toString('base64'),width:600,height:800}};
 await page.getByRole('button',{name:/03 排版与形象/}).click();await expect(studio.getByRole('img',{name:'AI候选 · 未确认，不进入简历',exact:true})).toBeVisible();expect(mock.calls.portrait).toBe(1);
 await page.screenshot({path:path.join(run,'screenshots/seedream-task-restored.png'),fullPage:true});
 await studio.getByRole('button',{name:'放弃候选，保留当前照片',exact:true}).click();await expect.poll(()=>mock.task).toBe(null);
 await page.getByRole('button',{name:'AI 助手设置',exact:true}).click();await page.getByRole('button',{name:/03 排版与形象/}).click();await expect(studio.getByRole('img',{name:'AI候选 · 未确认，不进入简历',exact:true})).toHaveCount(0);expect(mock.calls.portrait).toBe(1);
});


test('R22 Seedream credential deadline releases settings without any image request',async({page,context})=>{
 const mock=await aiMock(context);let release;const blocked=new Promise(resolve=>{release=resolve;});await context.route('**/api/connections/image/auth',async route=>{await blocked;await route.fulfill({json:{credentialsVerified:true}}).catch(error=>{if(!route.request().failure())throw error;});});
 await upload(page);await page.getByRole('button',{name:'AI 助手设置',exact:true}).click();const card=page.getByRole('region',{name:'照片助手',exact:true});await card.getByRole('combobox',{name:'选择图片服务',exact:true}).selectOption('seedream');await card.getByPlaceholder('粘贴服务提供方给你的密钥').fill('FICTIONAL_E2E_KEY');await page.clock.install();await card.getByRole('button',{name:'连接并验证密钥 · 不生图',exact:true}).click();await expect(card.getByText(/正在验证密钥，不调用生图/)).toBeVisible();await page.clock.fastForward(31000);
 await expect(card.getByRole('status')).toHaveText(/超过30秒，本次未调用生图/);await expect(card.getByRole('button',{name:'连接并验证密钥 · 不生图',exact:true})).toBeEnabled();expect(mock.calls.test).toBe(0);expect(mock.calls.portrait).toBe(0);release();
});
