# 本地代码审查评测入门

这是一套与项目放在一起的实验工具，直接调用 `src/chat.ts` 的 `Chat.codeReview`。MiniMax 请求适配与完整 Markdown JSON 代码块解析位于该文件，并有对应回归测试；实验过程不会发布 GitHub 评论或执行案例代码。

它测的是“这个项目的提示词和模型调用，在指定 API 上能否工作、审查得如何”。它不是整个机器人端到端测试，也不是正式的公开模型排行榜。

## 0. 已配好的文件

|文件|作用|
|---|---|
|`run.mjs`|实验调度：选模型、读案例、调用现有 Chat、保存记录|
|`core.mjs`|记录 HTTP 请求、检查输出结构、脱敏、提取用量|
|`providers.json`|服务地址、模型 ID、密钥变量名；没有密钥|
|`.env.example`|密钥模板|
|`.env`|本地密钥文件，从 `.env.example` 复制后填写；不要提交|
|`cases.json`|6 个手工设计的小案例及参考判断；答案不发送给模型|
|`core.test.mjs`|离线验证记录、脱敏、超时、错误处理和真实 Chat 的对接|
|`results/`|实验结果，已忽略 Git 跟踪|

没有新增 npm 依赖。需要已有 `npm ci` 的依赖和 Node.js 24，利用 Node 的 TypeScript 类型擦除直接加载 `src/chat.ts`。不需要先 build。

## 1. 每次开始

```bash
cd ~/Ainspector
export PATH="$(brew --prefix node@24)/bin:$PATH"
node --version
node eval/run.mjs --help
```

`cd` 决定命令在哪个项目里运行；`PATH` 决定使用哪个 Node；`--help` 查看工具用法。

先演练一次，不需要 key、不联网、不计费：

```bash
node eval/run.mjs --mock --provider deepseek,minimax --all
```

结尾会打印新的结果目录。模拟模式固定返回占位响应，`mode=mock`，模型标为 `mock-only`，用量为空。它只验证管道能走通，不能评价模型好坏。

默认（没有 `--live` 或 `--mock`）只打印计划，不读 key、不发请求：

```bash
node eval/run.mjs --provider deepseek,minimax --all
```

## 2. 去哪里收集 API 信息

2026-09-28 核对的官方来源：

|服务|密钥和账号|模型与价格|本工具名称 / 默认模型|
|---|---|---|---|
|DeepSeek|https://platform.deepseek.com/ 的 API keys、用量和余额页面|https://api-docs.deepseek.com/quick_start/pricing/|`deepseek` / `deepseek-v4-pro`|
|DeepSeek Flash|同上|同上；`deepseek-flash` 当前指向 V4.1 Flash，旧 V4 Flash 名称也被重定向到新版|`deepseek-flash` / `deepseek-flash`|
|Gemini Lite|https://aistudio.google.com/apikey 创建项目/API key，查看对应项目配额与账单|https://ai.google.dev/gemini-api/docs/pricing 和 https://ai.google.dev/gemini-api/docs/models|`gemini-lite` / `gemini-3.5-flash-lite`|
|MiniMax|https://platform.minimax.cn/ 的普通按量 API Key 与余额页面|https://platform.minimax.cn/docs/guides/pricing-paygo 和 https://platform.minimax.cn/docs/api-reference/text-openai-api|`minimax` / `MiniMax-M3`|

Gemini 使用官方兼容接口：https://ai.google.dev/gemini-api/docs/openai 。因为原项目已经使用 OpenAI SDK，评测沿用这个协议。
MiniMax 使用中国站官方 OpenAI 兼容接口 `https://api.minimax.cn/v1`；密钥需来自同一站点。这里的默认模型 `MiniMax-M3` 对应普通按量 API；`MiniMax-M3.1-Flash-Preview` 当前仅供 Token Plan / MiniMax Code 使用，不作为普通 API 默认模型。MiniMax 的 Thinking 默认开启，官方说明 M3 的 `content` 可能含 `<think>` 标签；而本项目要求纯 JSON 输出。项目对 `MiniMax-M3` 发送官方支持的 `thinking: {type: "disabled"}`，且不发送未在其 Chat Completions 文档列出的 `response_format`；现有提示词仍要求模型返回 JSON。若完整回复只是被一层 Markdown `json` 代码块包裹，解析器会剥去这层包装；其他无效 JSON 仍记为失败。先跑单例并检查 `status`，再批量测试。中国站与国际站的密钥和接口地址不要混用。

**需要收集：**服务商、API key、base URL、精确 model ID、账号是否可用/已开通计费、请求/每日配额、token 单价及计费规则。密钥本地保存；额度和余额到服务商控制台看；模型与参数到官方文档看。API 额度与 Cursor 订阅是两套计费。

Gemini 的地区可用性见 https://ai.google.dev/gemini-api/docs/available-regions 。若账号/地区不受支持，应使用受支持服务，不能仅靠填 key 解决。Google 免费与付费层的数据使用条款不同；这里只用虚构的小案例。

不要使用仅显示商品名、没有实际 model ID 的渠道来做可复现实验。模型别名可能升级；请求模型和响应模型都会记录，但响应仍可能只是别名。

## 3. 填密钥

```bash
cursor eval/.env
```

或用终端编辑器 `nano eval/.env`（保存 Ctrl+O、回车，退出 Ctrl+X）。填入：

```dotenv
DEEPSEEK_API_KEY=你的DeepSeek密钥
GEMINI_API_KEY=你的Gemini密钥
MINIMAX_API_KEY=你的MiniMax普通API密钥
```

用哪家填哪家即可。不要把实际 key 放进 `providers.json`、命令行参数、Git 或聊天。程序只读取选中服务所需的 key；不会自动加载项目根 `.env`。同名系统环境变量优先于这个文件。

可以检查忽略规则（不会打印密钥）：

```bash
git check-ignore eval/.env
```

## 4. 先做一次真实冒烟测试

以下带 `--live` 的命令会把案例 patch 发给对应服务，并可能产生费用：

```bash
node eval/run.mjs --live --provider deepseek --case auth-delete
```

成功后再测试另一家：

```bash
node eval/run.mjs --live --provider gemini-lite --case auth-delete
node eval/run.mjs --live --provider minimax --case auth-delete
```

只收到 HTTP 200 不等于审查成功。终端 `valid` 表示响应格式通过工具检查，仍需要人工判断内容是否正确。

模型不可用时，可先查询本账号模型列表（GET 请求，不生成评论）：

```bash
node eval/run.mjs --live --provider minimax --models
node eval/run.mjs --live --provider gemini-lite --models
node eval/run.mjs --live --provider deepseek --models
```

一次尝试不同 model ID：

```bash
node eval/run.mjs --live --provider gemini-lite --model gemini-3.5-flash-lite --case auth-delete
```

## 5. 跑同一组案例，再考虑重复实验

两家各 6 个案例，一共 12 次请求：

```bash
node eval/run.mjs --live --provider deepseek,minimax --all
```

两个便宜档位对照：

```bash
node eval/run.mjs --live --provider deepseek-flash,gemini-lite --all
```

确认费用和配额后，三轮重复是 36 次请求，需要显式提高次数上限：

```bash
node eval/run.mjs --live --provider deepseek,minimax --all --repeat 3 --max-requests 36
```

顺序执行，无并发。每条最多一次真实 HTTP 请求，不自动重试，任意技术失败就停止本批，避免认证/配额错误连续消耗尝试。默认超时 120 秒、`max_tokens=4096`。超时可能仍在服务端产生费用；次数和输出 token 限制不是美元预算保证。

默认每轮模型顺序交替，稍微减轻固定顺序偏差。开始阶段不要声称小样本证明了某个模型整体更强。

## 6. 结果在哪里，怎么读

每次在 `eval/results/时间-mode-随机ID/` 创建新目录，绝不覆盖旧实验：

|文件|主要内容|
|---|---|
|`REPORT.md`|阅读入口：本批状态、计数、人工评分说明|
|`manifest.json`|Git 提交/分支、工作区状态、源码与依赖锁哈希、案例快照、参考答案、参数、服务商|
|`001-服务-案例.json` 等|请求正文、原始回复、当前项目解析结果、HTTP 状态、错误、用量、时间|
|`records.jsonl`|上述逐条记录合并，一行一个 JSON，便于以后接可视化|
|`summary.csv`|便于比较的摘要与人工评分空列；可用 Numbers/Excel 打开|

进入命令末尾打印的目录，阅读 `REPORT.md`，然后打开某条 JSON 对照 `manifest.json` 中的预期。需要脱敏后再分享；结果包含发送的代码片段。

工具不保存 Authorization 头，并对当前密钥做脱敏。原始响应可能包含服务商的 reasoning_content 等字段；不要把它当作人工参考答案。

自动字段：请求和返回模型、时间、请求参数/提示词哈希、HTTP/解析状态、延迟、输入/输出/缓存/推理 token（接口提供时）、原始 JSON、项目解析结果。

人工填写 `summary.csv` 最后四列：

- `hit_expected_issue`：有缺陷案例 yes/no；干净案例和上下文不足案例 N/A。
- `false_positive_count`：无证据支持的缺陷指控数。合理的风格建议不直接当作漏洞误报。
- `actionability_0_to_2`：0 无法操作；1 笼统但方向正确；2 具体原因和可行修复。
- `notes`：判断依据，如“发现删除权限检查，但无证据断言所有请求均可绕过”。

不要用关键词匹配自动给模型打分。技术失败单独计入可用性，不悄悄当成漏报或正确。`context-boundary` 单独评价模型是否承认上下文不足。建议报告：技术成功率、已成功案例中的缺陷命中率、干净案例误报、延迟中位数、token 消耗，并写明样本数。

`cost_usd` 默认空值表示未知。去控制台账单对照单价、缓存、思考 token 和时段；DeepSeek 有峰谷价，不能用一个固定单价假装精确。Gemini 的输出定价可能包含思考 token，勿把细分 token 重复相加。账单可能延迟。

## 7. 这套工具测什么、不测什么

直接调用真实 `Chat.codeReview`，保留现有提示词和参数选择；没有重写另一套“看起来一样”的模型调用。不走 `bot.ts` 的过滤、长度限制、评论定位与发布。案例都是非空短 patch。

参数以实际保存的 `request` 为准：当前源码将普通模型的 `temperature=0` 转成 1；MiniMax-M3 为了保持 JSON 兼容而关闭思考，DeepSeek/Gemini 使用服务商默认思考策略。因此这是项目兼容性/实际配置比较，不是严格等思考预算的纯模型比较。提高输出上限或改变参数应当是新实验，保留失败记录。

`Chat` 对坏 JSON 有降级逻辑；工具另行检查原始响应，不能因为它返回了对象就算格式成功。没有 choice、空回复、截断、拒绝、无效 schema 各自记录。标题位置的字符串匹配只是诊断，最终 GitHub 合法位置仍须由项目原函数验证。

不启动或导入机器人服务入口，不向 GitHub 写入评论，不执行案例中的代码。此版本没有网页界面，已有 JSONL/CSV 可作为下一步本地可视化的数据来源。

## 8. 常见错误

|状态|先检查什么|
|---|---|
|401/403|key 是否来自对应平台、权限/地区/项目限制；MiniMax 中国站 `api.minimax.cn` 与国际站 `api.minimax.io` 的 key 不可混用|
|402|余额或计费状态|
|404|model ID、base URL，以及当前账号是否能使用该模型|
|429|服务商配额/速率限制；稍后手工重试，不循环轰炸|
|400|请求参数兼容性；看记录里的 request 与原始错误|
|transport_error|连接/超时；先确认服务可达，超时仍可能计费|
|truncated|输出被截断，检查 token 用量和思考预算，再以新实验提高上限|
|invalid_json / invalid_schema|接口回了内容，但不符合项目约定，需要分析兼容性|

技术自测（全部离线，无密钥）：

```bash
node --test eval/core.test.mjs
npm test -- --runInBand
```

运行后 `git status --short`，只提交你理解的文件。新增 `eval/` 可以单独提交；之前 `package-lock.json`、`yarn.lock` 的已有修改不属于这套工具。
