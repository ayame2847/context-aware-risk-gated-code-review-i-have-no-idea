# D 模块与个人 bot 验证记录

日期：2026-11-09。代码验证提交：6859482de28642ffe69b9e60e378cb073ad45a00。

## D 模块（离线领域逻辑）
- 个人 PR：https://github.com/ayame2847/context-aware-risk-gated-code-review-i-have-no-idea/pull/1
- 远程 CI：https://github.com/ayame2847/context-aware-risk-gated-code-review-i-have-no-idea/actions/runs/42578720159
- 远程完整 Jest：11 suites，410/410 通过，其中 D 97 项。
- 评测工具测试：43/43 通过。数据集行为检查 113 次，17 次预期违约不是 17 个独立缺陷。
- npm ci、typecheck、完整 build、Action 语法及已提交产物一致性检查均通过。
- 本地复用已有依赖，未安装依赖；首次完整 Jest 409/409，补最后一个身份反例后定向 D 97/97。最终完整数量以以上远程 410 为准。
- 本机构建存在既有 Rollup external dependency 警告。依赖符号链接引起的无关模块编号变化未提交；远程干净构建已确认产物一致。

## 个人仓库真实模型审查
- main 部署提交：d42ef566810e9ebe50a1451f93c3350ad919effc。
- 演示 PR：https://github.com/ayame2847/context-aware-risk-gated-code-review-i-have-no-idea/pull/2
- 演示 head：05b23b353bc7838096ff4549257f484ce382341f。
- 实际模型：deepseek-flash，OpenAI 兼容 API：https://api.deepseek.com。
- 实际运行：https://github.com/ayame2847/context-aware-risk-gated-code-review-i-have-no-idea/actions/runs/42578908574 ，success。
- 机器人 review：https://github.com/ayame2847/context-aware-risk-gated-code-review-i-have-no-idea/pull/2#pullrequestreview-5822705898 。
- 机器人具体意见：https://github.com/ayame2847/context-aware-risk-gated-code-review-i-have-no-idea/pull/2#discussion_r4510286669 。
- 已核实 review 的 commit_id 等于演示 head；模型指出 && 改为 || 会允许负数和超额取款，建议恢复 && 并补边界测试。
- Secret 由用户在 GitHub 保存，仅检查名称/存在性；没有读取或提交密钥，没有把本机绝对路径写入新增公开文件。

## 解释结果的边界
实际验证的是旧 bot 入口的 PR 事件 → DeepSeek → GitHub review 链路，不是 D 生产 gate。D 只在独立测试及可注入流水线中验证；尚未部署 required status、同 SHA 批准撤销串行化及真实权限适配器。

旧模板标题仍显示“Code review by ChatGPT”，这是上游硬编码文本，实际模型由环境 MODEL=deepseek-flash 确认。旧行内定位使用 hunk 末行，本次意见落在函数结束行而非条件表达式所在行；内容正确，但行定位精度仍可改进。

演示缺陷 PR 保留打开供学习，不合并。仅凭这一个人为构造的缺陷不能计算模型准确率或泛化效果。
