# 个人仓库真实审查演示

本部署使用现有 GitHub Action 的旧 bot 入口，验证真实 PR 事件 → 模型调用 → GitHub review 评论。它不接入 D 的生产风险门禁，也不设置 required status。

## 配置
仓库 Settings → Secrets and variables → Actions：
- Secret OPENAI_API_KEY：DeepSeek API Key，不写进代码、文档或聊天。
- Variable MODEL：可选，默认 deepseek-flash。
- Variable OPENAI_API_ENDPOINT：可选，默认 https://api.deepseek.com。

项目使用 OpenAI 兼容协议，不使用 /anthropic 地址。GitHub Models 已于 2026-07-30 退役，工作流明确 USE_GITHUB_MODELS=false。

官方资料：
- https://docs.github.com/en/github-models
- https://api-docs.deepseek.com/
- https://api-docs.deepseek.com/guides/json_mode/

## 范围
personal-review.yml 仅对 demo/** 的 opened / synchronize 事件运行，要求 PR 作者、触发者为本仓库 owner，来源为同仓库分支。不自动审查外部 fork。

Action 代码固定在已审核的项目提交 0cee0bb，不执行 PR 中的演示代码。工作流只有读取仓库和发布 PR review 的权限；不使用 debug，不输出 Key。最多运行 5 分钟，单份 patch 限 12000 字符，输出限 8192 tokens。旧入口可能使用 SDK 自带重试，不等于 C 模块的全 PR 严格预算演示。

## 如何复现
main 的 demo/withdrawal.ts 使用 &&，要求金额为正且不超过余额。测试 PR 把 && 改为 ||，故意引入错误：余额 10、取款 100 也会被允许。

不要合并缺陷 PR。查看 Actions 的 Personal Bot Review 和 PR 的 Reviews / Files changed：
1. 工作流确实触发；
2. 模型请求成功并返回可校验的审查结构；
3. github-actions[bot] 留下对应 head SHA 的 review；
4. 人工确认是否指出实际逻辑错误。

一次真实链路结果不能当作模型准确率或生产门禁验收。Secret 未配置时预检明确失败，保存后可在失败运行页面 Re-run failed jobs。
