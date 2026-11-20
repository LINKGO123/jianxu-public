# 桌面页面仿真

只操作隔离生产构建和独立Chromium context，不连接4173用户服务。测试实例固定使用生产已允许的127.0.0.1:5173；端口占用则失败，禁止复用现有实例。所有浏览器外域请求拒绝；测试服务DNS/HTTPS/fetch外发通道也阻断，缺少能力替身不会调用真实供应商。

先构建再执行（cwd为product；以下环境已提供Playwright时无需安装）：

```sh
export JIANXU_PLAYWRIGHT_ROOT=/绝对路径/node_modules/playwright
export JIANXU_CHROMIUM_EXECUTABLE=/绝对路径/Chromium可执行文件
export JIANXU_E2E_RUN=../output/testing/RUN-YYYYMMDD-NNN
npm run build:e2e
npm run test:e2e
JIANXU_CHECK_ROOT="$JIANXU_E2E_RUN/runtime" npm run check:static
```

如项目本身已安装playwright，省略JIANXU_PLAYWRIGHT_ROOT即可；默认使用包匹配的浏览器，已存在其他运行时则显式提供可执行路径。本轮实际版本、路径及限制见RUN-20261029-002/report.md。没有引入全局工具、依赖或安装浏览器。

build:e2e执行同一TypeScript检查、Vite生产构建和服务端编译，只清空本轮runtime/client，不写product/dist。runtime/node_modules链接现有项目依赖。test:e2e默认RUN-20261029-002，可用JIANXU_E2E_RUN明确选择新目录；每次批次用JIANXU_E2E_RESULT设不同JSON文件名，保留首次失败。retries固定0，workers固定1。

页面真实执行上传/Worker、IDB、裁切、预览和下载。fixtures.cjs只替换能力检查/建议/候选及指定故障；session接口通过真实请求取得临时CSRF/Cookie，仅投影被替身验证的能力状态。配置PUT、草稿、历史和文件业务不整体mock。真实后端鉴权/协议/VPN由Node测试另证，页面替身不能作供应商能力或计费证明。

trace只采集本轮虚构会话，停止后清除测试Key和64位临时会话标记，删除未脱敏临时ZIP；交付前还须解压扫描所有资源。截图不含用户资料。动画等待明确加载状态，在加载后0/1/3秒采样，暂停时另观察1秒；这些定时仅用于动画观察，不用于掩盖业务异步竞态。

## 授权后的当前运行版本冒烟

仅在用户明确授权更新并复验当前4173服务时使用：设置`JIANXU_E2E_CURRENT=1`和新`JIANXU_E2E_RUN`，先准备该RUN的candidate-build.json及current-after-http.json，再执行`npm run test:e2e`。配置仅选择current-smoke.current.cjs且不启动/停止webServer。全新context只允许GET /api/session，其他API与外域全部阻止；不调用AI、设置或用户数据清理接口。不接入已有浏览器profile/Cookie。

断言对照候选构建哈希：主脚本/解析Worker用浏览器response字节，PDF嵌套Worker用只读CDP执行目标URL加实际4173静态HTTP字节。普通response事件不保证覆盖嵌套Worker，因此不得把缺事件误判成应用未启动子Worker。回退及应用步骤见RUN-20261030-001报告；未授权时保持默认隔离5173模式。

## 导入与长稿体验回归

`usability.spec.cjs`覆盖U09页首资料预填、PDF首页本地渲染/取消读取/键盘裁切/刷新回退/坏文件保留旧照，U10舒展与紧凑分页、正文不变、刷新保存、真实PNG下载与确认失效。PDF夹具源为`tests/fixtures/generate-header-photo.py`，仅包含虚构文字和几何图形；用已安装reportlab的Python执行生成，不放真实头像。取消用例只延迟本地动态模块交付，不替换PDF渲染或裁切业务；像素断言确认框选到彩色头像区域。

`readability.spec.cjs`新增R11手工分组→正文不变→刷新→编辑后清除过期分组→单栏预览/PNG，以及R12本地参考裁切不写草稿→两图发送预览→有序双图请求→采用候选后仍从原照裁切生成→切换来源撤销发送勾选。AI响应仍只在外部边界替换，渲染、裁切、资产历史和实际下载保持真实实现。新结构测试使用虚构文字/几何图，不导入用户头像。
