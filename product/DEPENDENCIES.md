# 依赖说明（历史批次及当前D/E）

单个 npm 包与唯一 package-lock.json，固定直接版本。不运行依赖安装脚本；安装命令使用 `--ignore-scripts`。

| 依赖 | 实际用途/为何需要 | 许可证 |
| --- | --- | --- |
| React / React DOM 19.2.0 | 用户指定前端，控制输入与统一内容预览 | MIT |
| Vite 7.3.7 | 用户指定开发构建、多入口与同源 API 代理 | MIT |
| Fastify 5.12.7 | 用户指定 Node 服务、受限请求 hooks | MIT |
| @fastify/static 10.1.8 | Fastify 官方静态目录插件，避免手写路径/流式资源服务 | MIT |
| Zod 4.6.7 | 开发方案的边界校验与推导类型；项目无已有运行时 schema 库 | MIT |
| TypeScript 5.9.3 / @types/* | 严格类型检查及服务端编译 | Apache-2.0 / MIT |
| tsx 4.20.6 | 本地开发及 Node 测试直接加载 TS/TSX；不用第二套测试运行器 | MIT |
| fake-indexeddb 6.2.4 | 仅测试，允许在无浏览器条件下运行真实 IDB 适配器和事务失败路径 | Apache-2.0 |

没有新增路由器、全局状态库、组件库、动画库、解析/导出/MCP 依赖。Node 自带测试运行器替代建议候选 Vitest，当前用例无需安装另一套运行器。

维护与风险检查：直接版本已在本机 Node 24.21.0 完成安装、类型、23 项测试和成品构建；官方静态插件已通过 Fastify 成品注入检查。首次 audit 指出的直接依赖漏洞已升级修复，最终全树 audit 为 0；这只是本次已知漏洞数据库结果，不代表全面安全验收。

体积（本次构建）：工作台 JS 约 322.4 kB / gzip 101.7 kB；CSS 约 15.6 kB / gzip 4.1 kB。完整 node_modules（含开发工具与平台包）约 96 MiB，静态图另计。两份继承规则完整保留；后续新增解析或导出库需按实际阶段重新评估。

阶段 A 修复未改 package.json/锁文件，未安装新依赖或工具；本轮不重新访问 audit 服务，先前 0 已知漏洞结果只属于原检查批次。

## 阶段 B 新增（2026-10-27～28）

| 依赖 | 实际用途与替代选择 | 许可证 |
| --- | --- | --- |
| pdfjs-dist 6.4.299 | Worker中真实PDF文本/位置提取；标准平台不提供PDF解析，不手写解析器。要求Node>=22.13；浏览器构建的Worker约1.89MB，按需加载 | Apache-2.0；CMap/标准字体随包保留各自许可 |
| fflate 0.8.3 | DOCX逐块解压并执行实际体积/CRC限制，不以一次性unzip绕过压缩边界 | MIT |
| saxes 6.0.0 | Worker没有DOMParser；严格流式XML解析，不把Word转为HTML或写正则XML解析器 | ISC |

复用PDF.js可选Node图形依赖@napi-rs/canvas仅用于本轮PNG检查，没有另装浏览器或图形工具；生产浏览器用原生Canvas/ImageBitmap。未采用Mammoth（会再引入ZIP路径）或html-to-image（本轮预览与PNG直接共用Canvas绘制器），没有引入AI/MCP依赖。

阶段 B 实际构建工作台约382.0kB / gzip121.6kB，CSS16.6kB / gzip4.4kB；PDF.js解析Worker约1.89MB，照片Worker1.68kB，生成CMap/标准字体资源约2.4MiB。精确数据见RUN-005/build.txt。本轮npm audit全树0已知漏洞，见audit.json；这不等于全面安全或真实页面验收。

## 阶段 C（2026-10-28）

没有新增依赖或改动npm锁。HTTPS/TLS、DNS、公网地址范围和固定连接使用Node内置https/dns/net，凭据与任务复用Fastify内存会话；前端复用React、Zod和原保存事务。没有模型SDK、路由器、状态库、测试运行器或聊天组件库。未安装工具/插件、未执行新网络audit；旧0漏洞只属于原批次。实际构建体积和检查结果见RUN-20261028-006，不把依赖复用或L1网络替身当真实服务验收。

## 阶段 D/E 当前依赖（2026-10-28）

仍为一个npm包与唯一锁文件，固定版本，不安装新的测试运行器、组件库或工具/插件。以下三项使用`--ignore-scripts --no-audit`安装；npm仓库访问经工具审批后成功。原有阶段A/B/C体积是历史记录，当前以RUN-20261028-011/build.txt为准。

| 依赖 | 当前用途及替代选择 | 许可证/维护 |
| --- | --- | --- |
| @modelcontextprotocol/sdk 1.32.2 | 官方Streamable HTTP握手、工具发现/调用、JSON-RPC与Ajv schema校验；遵循开发计划，不手写另一套MCP协议或schema执行器。仅服务端使用 | MIT，MCP官方维护；版本固定，升级仍需回归 |
| pinyin-pro 3.29.5 | 为既有yearbook-model提供真实拼音函数；浏览器没有标准拼音API，避免复制自建字典。可自定义修正多音字/姓名，不作为读音真值 | MIT；版本固定 |
| @napi-rs/canvas 1.0.13 | 从PDF.js原有可选依赖固定为直接依赖；Node Worker真实图片解码和PNG重编码、图形证据。浏览器仍用原生Canvas/Worker，不进前端包；不用新增转换工具 | MIT；原生平台包由npm选择，跨平台仍须实机验证 |

SDK新增约82个传递包（安装批次计数），代价是服务端依赖体积。拼音词库增加前端体积：当前工作台约732kB/gzip277kB，CSS约18kB；Vite >500kB chunk警告保留，未调阈值掩盖，实际加载性能待页面验收。Node图形为已存在的原生依赖，`npm ci`不能省略optionalDependencies；无install scripts要求，验证安装命令`npm ci --ignore-scripts`。

本轮真实`npm audit --json`全树0已知漏洞，完整输出RUN-011/audit.txt；仅说明当时数据库结果，不是供应链或全面安全证明。未运行不可信远程脚本、未更改全局skill。真实供应商协议/质量/费用和MCP服务兼容性仍待明确目标后实测。
