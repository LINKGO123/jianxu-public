import test from 'node:test';
import assert from 'node:assert/strict';
import {renderToStaticMarkup} from 'react-dom/server';
import {TextConnection} from '../client/text-ai/TextConnection.js';
import {ExternalConnections} from '../client/external/Connections.js';
import {ConnectionFeedback,connectionMessage} from '../client/ConnectionFeedback.js';
import {LocalTextApi} from '../client/text-ai/api.js';
import {seedreamImageBaseUrl,seedreamDefaultModel,seedreamFlashModel} from '../shared/portrait-ai.js';

test('assistant settings show presets and key entry, with advanced options and optional tools collapsed',()=>{
 const api=new LocalTextApi();const refresh=async()=>{};
 const text=renderToStaticMarkup(<TextConnection api={api} session={null} refresh={refresh}/>);
 assert.match(text,/>文字助手</);assert.match(text,/>选择你使用的 AI</);assert.match(text,/option value="deepseek" selected/);
 assert.match(text,/placeholder="粘贴服务提供方给你的密钥"/);assert.match(text,/type="password"/);
 assert.match(text,/<details class="advanced-connection">/);assert.match(text,/连接并检查 · 可能计费/);
 assert.match(text,/不含简历/);assert.doesNotMatch(text,/type="checkbox" checked/);
 const external=renderToStaticMarkup(<ExternalConnections api={api} session={null} refresh={refresh}/>);
 assert.match(external,/>照片助手</);assert.match(external,/option value="openai" selected/);
 assert.match(external,/<details class="optional-tools">/);assert.match(external,/不上传你的照片或简历/);assert.match(external,/不自动授权/);
 assert.doesNotMatch(external,/type="checkbox" checked/);
});

test('existing connected custom configuration is preserved and its edit form starts collapsed',()=>{
 const session={csrfToken:'a'.repeat(64),connections:{text:'connected' as const,image:'unavailable' as const,mcp:'disabled' as const},textConnection:{id:crypto.randomUUID(),baseUrl:'https://example.com/v1',model:'fictional-custom'}};
 const html=renderToStaticMarkup(<TextConnection api={new LocalTextApi()} session={session} refresh={async()=>{}}/>);
 assert.match(html,/<details class="connection-form">/);assert.match(html,/已连接，可以使用/);
 assert.match(html,/value="https:\/\/example.com\/v1"/);assert.match(html,/value="fictional-custom"/);
 assert.match(html,/option value="custom" selected/);assert.match(html,/>更换服务或修改连接</);
});

test('plain-language feedback keeps exact technical errors under a closed details disclosure',()=>{
 const raw='[RATE_OR_QUOTA · 服务商响应 · 服务商HTTP 429 · 本机HTTP 502] 原始诊断';
 const html=renderToStaticMarkup(<ConnectionFeedback message={raw} refreshError="[LOCAL_NETWORK_FAILED] 虚构状态失败"/>);
 assert.match(html,/服务暂时拒绝请求/);assert.match(html,/<details><summary>查看问题详情<\/summary><pre>/);
 assert.match(html,/RATE_OR_QUOTA/);assert.match(html,/上方操作结果仍然保留/);assert.match(html,/不要重复发起/);
 assert.doesNotMatch(connectionMessage(raw),/余额为零|限流已确认/);
 assert.equal(connectionMessage('[VERIFIED] 文字助手已连接，可以使用。'),'文字助手已连接，可以使用。');
 assert.match(connectionMessage('[TARGET_REJECTED · 网络连接] 失败'),/高级设置/);
 assert.match(connectionMessage('[MODEL_NOT_OPEN · 服务商响应 · 服务商HTTP 404 · 本机HTTP 502] 失败'),/开通/);
 assert.match(connectionMessage('[LOCAL_HTTP_403] 失败'),/本机服务/);
});

 test('Qwen settings show standard/Pro and clarity choices, preserving a connected Qwen session without exposing its key',()=>{
 const session={csrfToken:'a'.repeat(64),connections:{text:'unavailable' as const,image:'connected' as const,mcp:'disabled' as const},imageConnection:{id:crypto.randomUUID(),baseUrl:'https://maas.qianwenaiapi.com/compatible-mode/v1',model:'qwen-image-3.0-pro',provider:'qwen' as const,size:'2048x2048' as const,capabilities:{single:true,multiple:false}}};
 const html=renderToStaticMarkup(<ExternalConnections api={new LocalTextApi()} session={session} refresh={async()=>{}}/>);
 assert.match(html,/option value="qwen" selected/);assert.match(html,/option value="qwen-image-3.0-pro" selected/);assert.match(html,/option value="2048x2048" selected/);
 assert.match(html,/标准版 · 千问 3.0/);assert.match(html,/每次生成一张/);assert.match(html,/当前图片服务：千问 · 3.0 Pro · 高清/);
 assert.match(html,/<details class="connection-form">/);assert.match(html,/<details class="advanced-connection">/);assert.match(html,/不上传你的照片或简历/);
 assert.match(html,/使用本机 VPN／代理兼容模式/);assert.doesNotMatch(html,/结果图片代理兼容（千问，独立开启）/);assert.match(html,/dashscope-result-sz.oss-cn-shenzhen.aliyuncs.com/);assert.match(html,/dashscope-a717.oss-accelerate.aliyuncs.com/);assert.doesNotMatch(html,/type="checkbox" checked/);
});

test('VPN settings: pending test exposes phase and download-only recovery while blocking another paid check',()=>{
 const session={csrfToken:'a'.repeat(64),connections:{text:'connected' as const,image:'failed' as const,mcp:'disabled' as const},imageConnection:{id:crypto.randomUUID(),baseUrl:'https://maas.qianwenaiapi.com/compatible-mode/v1',model:'qwen-image-3.0',provider:'qwen' as const,size:'1024x1024' as const,proxyCompatibility:true,resultProxyCompatibility:true,capabilities:{single:false,multiple:false},check:{network:'passed',generation:'passed',download:'failed'},pendingDownload:{id:crypto.randomUUID(),kind:'test' as const,expiresAt:Date.now()+60000}}};
 const html=renderToStaticMarkup(<ExternalConnections api={new LocalTextApi()} session={session} refresh={async()=>{}}/>);
 assert.match(html,/照片连接检查进度/);assert.match(html,/图片生成：通过/);assert.match(html,/图片下载：未通过/);assert.match(html,/>重新下载检测图片 · 不重新生成</);assert.match(html,/<button class="primary-button" disabled="">连接并检查/);
 assert.equal((html.match(/使用本机 VPN／代理兼容模式/g)??[]).length,1);assert.match(html,/保留15分钟/);
});

test('users can check DeepSeek/Qwen network without entering or saving keys, with capability success kept distinct',()=>{
 const api=new LocalTextApi(),refresh=async()=>{};
 const text=renderToStaticMarkup(<TextConnection api={api} session={null} refresh={refresh}/>);
 assert.match(text,/只检查网络 · 不需要密钥 · 不计费/);
 assert.equal(connectionMessage('[NETWORK_VERIFIED] 网络预检查通过，尚未验证密钥。'),'网络预检查通过，尚未验证密钥。');
});

test('Seedream presets show Flash and Pro accurately, keep custom endpoints and never expose a saved key',()=>{
 for(const model of [seedreamDefaultModel,seedreamFlashModel,'ep-fictional-seedream']){
  const session={csrfToken:'a'.repeat(64),connections:{text:'unavailable' as const,image:'connected' as const,mcp:'disabled' as const},imageConnection:{id:crypto.randomUUID(),baseUrl:seedreamImageBaseUrl,model,provider:'seedream' as const,size:'2048x2048' as const,credentialsVerified:true,capabilities:{single:false,multiple:false},proxyCompatibility:true}};
  const html=renderToStaticMarkup(<ExternalConnections api={new LocalTextApi()} session={session} refresh={async()=>{}}/>);
  assert.match(html,/经济版 · Seedream 5.0 Flash/);assert.match(html,/精细版 · Seedream 5.0 Pro/);assert.match(html,/同一方舟连接只切换模型时，可沿用当前密钥/);
  assert.ok(html.includes(`option value="${model.startsWith('ep-')?'custom':model}" selected`));
  assert.ok(html.includes(model===seedreamFlashModel?'Flash · 速度更快、价格更低':model===seedreamDefaultModel?'Pro · 优先画质':'自定义方舟模型'));
  assert.match(html,/type="password"/);assert.match(html,/密钥已验证/);assert.doesNotMatch(html,/value="sk-|value="ark-/);
 }
});
