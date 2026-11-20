const path=require('node:path');
const fs=require('node:fs');
const crypto=require('node:crypto');
const {test:base,expect}=require(path.join(process.env.JIANXU_PLAYWRIGHT_ROOT,'test.js'));
const {zipSync,unzipSync,strToU8,strFromU8}=require('fflate');
const {createCanvas,loadImage}=require('@napi-rs/canvas');
const run=path.resolve(process.env.JIANXU_E2E_RUN||'../output/testing/RUN-20261029-002');
const fixture=name=>path.resolve('tests/fixtures',name);
async function openContentSections(page){for(const section of await page.locator('details.section-editor').all())if(await section.getAttribute('open')===null)await section.locator(':scope > summary').click();}
async function step(page,name){await page.getByRole('button',{name:new RegExp(name+'$')}).click();if(name==='整理内容')await openContentSections(page);}
async function upload(page,name='fictional-01.docx',expected='虚构测试1',expandSections=true){
 await page.goto('/workbench/');await page.getByLabel('选择本地文件').setInputFiles(fixture(name));await expect(page.getByLabel('姓名',{exact:true})).toHaveValue(expected);
 if(expandSections)await openContentSections(page);
}
async function saved(page){await expect(page.locator('.workflow-project [role=status]')).toHaveText(/已保存|已恢复|版本已保存/);}
async function state(page){return page.evaluate(()=>new Promise((resolve,reject)=>{const r=indexedDB.open('jianxu-product-v1');r.onerror=()=>reject(r.error);r.onsuccess=()=>{const db=r.result,tx=db.transaction('state'),s=tx.objectStore('state'),d=s.get('draft'),h=s.get('history'),a=s.get('assets');tx.oncomplete=()=>{resolve({document:d.result,history:h.result,assetIds:Object.keys(a.result||{}),assets:Object.values(a.result||{}).map(x=>({id:x.id,parentId:x.parentId,kind:x.kind,sourceId:x.sourceId,templateId:x.templateId,faceRestored:x.faceRestored,width:x.width,height:x.height,size:x.blob.size}))});db.close();};};}));}
async function openPortraitOptions(page){const options=page.locator('.portrait-ai-options');if(await options.count()&&await options.getAttribute('open')===null)await options.locator(':scope > summary').click();}
async function preview(page){await step(page,'排版与形象');await expect(page.getByRole('region',{name:'排版与形象工作区'}).getByText('预览已更新',{exact:true})).toBeVisible();await page.getByRole('navigation',{name:'美化配置'}).getByRole('button',{name:'照片',exact:true}).click();await openPortraitOptions(page);}
async function confirm(page){await step(page,'确认生成');await page.getByLabel(/我已逐项核对/).check();await page.getByRole('button',{name:'确认当前版本',exact:true}).click();await expect(page.getByRole('button',{name:'生成可下载 PNG',exact:true})).toBeEnabled();}
async function download(page,prefix){await page.getByRole('button',{name:'生成可下载 PNG',exact:true}).click();const links=page.getByRole('link',{name:/下载 PNG · 第/});await expect(links.first()).toBeVisible();const n=await links.count(),files=[];for(let i=0;i<n;i++){const event=page.waitForEvent('download');await links.nth(i).click();const d=await event,file=path.join(run,'exports',`${prefix}-${i+1}.png`);await d.saveAs(file);const image=await loadImage(fs.readFileSync(file));expect([image.width,image.height]).toEqual([2480,3508]);files.push(file);}return files;}
function synthetic(){const c=createCanvas(600,800),x=c.getContext('2d');x.fillStyle='#bcd9ef';x.fillRect(0,0,600,800);x.fillStyle='#e2b59b';x.beginPath();x.ellipse(300,280,120,160,0,0,Math.PI*2);x.fill();x.fillStyle='#243f60';x.fillRect(130,470,340,330);return c.toBuffer('image/png');}
const test=base.extend({audit:[async({page,context},use,info)=>{
 const errors=[],external=[];page.on('pageerror',e=>errors.push(e.message));
 await context.route('**/*',async route=>{
  const request=route.request(),u=new URL(request.url()),current=process.env.JIANXU_E2E_CURRENT==='1';
  if(['blob:','data:'].includes(u.protocol))return route.continue();
  if(u.origin===(current?'http://127.0.0.1:4173':'http://127.0.0.1:5173')){
   if(!current||!u.pathname.startsWith('/api/')||(u.pathname==='/api/session'&&request.method()==='GET'))return route.continue();
   external.push('BLOCKED_API '+request.method()+' '+u.pathname);
  }else external.push(u.origin);
  return route.abort('blockedbyclient');
 });
 await context.tracing.start({screenshots:true,snapshots:true,sources:false});
 await use();
 const id=crypto.createHash('sha256').update(info.title).digest('hex').slice(0,10),batch=(process.env.JIANXU_E2E_RESULT||'final').replace('.json','');
 await page.screenshot({path:path.join(run,'screenshots',`${batch}-${id}.png`),fullPage:true}).catch(error=>errors.push('Screenshot failed: '+error.message));
 const raw=path.join(run,'traces',`.raw-${batch}-${id}.zip`);await context.tracing.stop({path:raw});
 const zip=unzipSync(fs.readFileSync(raw));for(const name of Object.keys(zip)){if(/\.(trace|network|json|txt|html)$/.test(name)){const text=strFromU8(zip[name]).replace(/FICTIONAL_E2E_KEY/g,'REDACTED_TEST_KEY').replace(/\b[a-f0-9]{64}\b/g,'REDACTED_SESSION_TOKEN');zip[name]=strToU8(text);}}
 fs.writeFileSync(path.join(run,'traces',`${batch}-${id}.zip`),zipSync(zip));fs.unlinkSync(raw);
 fs.writeFileSync(path.join(run,'screenshots',`${batch}-${id}-events.json`),JSON.stringify({title:info.title,errors,external,viewport:page.viewportSize(),dpr:await page.evaluate(()=>devicePixelRatio).catch(()=>null)},null,2));
 expect(external,'no external browser request may escape').toEqual([]);expect(errors,'no uncaught page error').toEqual([]);
 },{auto:true}]});
async function aiMock(context){
 const s={verified:{text:false,image:false},authorized:false,task:null,mode:'ok',calls:{text:0,portrait:0,retry:0,test:0},pending:null,requests:[],gates:[]};
 await context.route('**/api/**',async route=>{
  const req=route.request(),url=new URL(req.url()),p=url.pathname;const body=req.method()==='GET'?null:req.postDataJSON();
  if(p==='/api/session'){const response=await route.fetch(),d=await response.json();for(const kind of ['text','image'])if(d[kind+'Connection']){if(s.verified[kind])d.connections[kind]='connected';if(kind==='image'){d.imageConnection.capabilities={single:s.verified.image,multiple:s.verified.image};if(s.authorized){d.connections.image='connected';d.imageConnection.credentialsVerified=true;d.imageConnection.modelListed=true;}if(s.task)d.imageConnection.portraitTask=s.task.task;if(s.pending){d.imageConnection.pendingDownload=s.pending;d.imageConnection.check={network:'passed',generation:'passed',download:'failed'};d.connections.image='failed';}}}return route.fulfill({response,json:d});}
  if(p==='/api/connections/image/auth'){if(s.mode==='AUTH_FAILED')return route.fulfill({status:502,json:{error:'虚构认证失败',diagnostic:{code:'AUTH_FAILED',stage:'http',upstreamStatus:401}}});s.authorized=true;return route.fulfill({json:{credentialsVerified:true,modelListed:true}});}
  if(p==='/api/ai/portrait/tasks'){
   s.calls.portrait++;s.requests.push(body);const {images:_images,connectionId:_connectionId,requestId,...metadata}=body;s.task={task:{id:requestId,...metadata,phase:'waiting',startedAt:Date.now(),expiresAt:Date.now()+900000}};
   if(s.mode!=='late'){s.task.task.phase='succeeded';s.task.result={requestId,...metadata,image:{base64:synthetic().toString('base64'),width:600,height:800}};delete s.task.result.options;if(body.images.length===2)s.task.template={base64:synthetic().toString('base64'),width:600,height:800};}
   return route.fulfill({status:202,json:{task:s.task.task}});
  }
  if(p==='/api/ai/portrait/tasks/status')return route.fulfill({json:s.task});
  if(p==='/api/ai/portrait/tasks/dismiss'){s.task=null;return route.fulfill({json:{dismissed:true}});}
  if(/^\/api\/connections\/(text|image)\/network$/.test(p)||p==='/api/network/check')return route.fulfill({json:{vpnCompatibility:true,targets:[]}});
  if(/^\/api\/connections\/(text|image)\/test$/.test(p)){const kind=p.split('/')[3];s.calls.test++;if(s.mode==='download-failed'){s.pending={id:crypto.randomUUID(),kind:'test',expiresAt:Date.now()+900000};s.verified.image=false;return route.fulfill({status:502,json:{error:'结果图片网络失败。不要重复生成，以免再次计费。',diagnostic:{code:'IMAGE_DOWNLOAD_FAILED',stage:'network',causeCode:'NETWORK_FAILED'}}});}if(s.mode!=='ok'){const code=s.mode,status=code==='AUTH_FAILED'?401:code==='RATE_OR_QUOTA'?429:400;return route.fulfill({status:502,json:{error:'虚构连接失败',diagnostic:{code,stage:'http',upstreamStatus:status}}});}s.verified[kind]=true;return route.fulfill({json:{ok:true}});}
  if(p==='/api/ai/text'){
   s.calls.text++;s.requests.push(body);
   if(s.mode==='offline')return route.abort('internetdisconnected');
   if(s.mode==='late')await new Promise(resolve=>s.gates.push(resolve));
   const suggestions=body.sections.map(x=>({sectionId:x.id,before:x.text,after:x.text.replace(/[ \t]+$/gm,''),reason:'核对原文并整理行尾空格'})).filter(x=>x.before!==x.after);
   return route.fulfill({json:{requestId:body.requestId,documentId:body.documentId,baseRevision:body.baseRevision,diagnosis:['虚构检查：请核对日期'],questions:[],suggestions}}).catch(error=>{if(!req.failure())throw error;});
  }
  if(p==='/api/ai/portrait'){
   s.calls.portrait++;s.requests.push(body);
   if(s.mode==='late')await new Promise(resolve=>s.gates.push(resolve));
   const image={base64:synthetic().toString('base64'),width:600,height:800};
   return route.fulfill({json:{requestId:body.requestId,documentId:body.documentId,baseRevision:body.baseRevision,sourceAssetId:body.sourceAssetId,style:body.style,...(body.templateDigest?{templateDigest:body.templateDigest}:{}),image}}).catch(error=>{if(!req.failure())throw error;});
  }
  if(p==='/api/connections/image/retry-download'){s.calls.retry++;if(s.mode==='expired')return route.fulfill({status:409,json:{error:'待下载结果已过期，请按当前版本重新操作。'}});s.pending=null;s.verified.image=true;return route.fulfill({json:{ok:true}});}
  return route.fallback();
 });return s;
}
async function connect(page,kind='text'){
 await page.getByRole('button',{name:'AI 助手设置',exact:true}).click();
 const card=page.getByRole('region',{name:kind==='text'?'文字助手':'照片助手',exact:true});
 await card.getByPlaceholder('粘贴服务提供方给你的密钥').fill('FICTIONAL_E2E_KEY');await card.getByRole('button',{name:'连接并检查 · 可能计费',exact:true}).click();await expect(card.getByText('已连接，可以使用',{exact:true})).toBeVisible();
}
module.exports={openPortraitOptions,test,expect,run,fixture,step,upload,saved,state,preview,confirm,download,synthetic,aiMock,connect};
