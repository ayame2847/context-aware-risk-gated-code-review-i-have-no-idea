# D 风险门禁：给只学过基础 Python 的同学

## 先弄清楚这次实现了什么

D 收到已经整理好的 PR、分析结果和人工审阅记录，回答两个不同的问题：

- 风险有多大？calculateRisk 返回 LOW / MEDIUM / HIGH / UNKNOWN。
- 现在能放行吗？decideGate 返回 PASS / WAITING / ERROR / STALE。

专业表述：确定性的领域纯函数，不依赖网络、环境变量、模型客户端或 GitHub SDK，不改变调用方传入的数据。同一份输入得到同一份输出。PASS 只是计算结论；要真正阻止合并，还需要 A 发布可信的 commit status、接入事件和由仓库管理员设置 required status。

D 已实现并在流水线中演示显式注入；现有 src/bot.ts 的旧机器人入口尚未自动切到 D。个人真实模型 Action 演示与 D 离线测试分别验收，不混为生产门禁已上线。

## 建议阅读顺序

1. src/review/contracts.ts：先看 RiskResult、GateContext、GateResult、CalculateRisk 和 DecideGate。
2. src/review/risk.ts：看 calculateRisk，先理解规则优先级，再读辅助函数。
3. src/review/gate.ts：看 decideGate，再读 orderedHistory。
4. test/review/risk-gate.test.ts：看正常、反例和流水线注入测试。
5. src/pipeline.ts：看 providers.risk / providers.gate 的调用位置。
6. scripts/demo-risk-gate.cjs：演示脚本，用已有分析样例作为 D 的输入。

运行：
```sh
node scripts/demo-risk-gate.cjs
npm test -- --runInBand test/review/risk-gate.test.ts
```

脚本不会调用付费模型。它把受控分析样例交给真实 D 函数计算，不是在测试 B/C 的检索或推理能力。

## 从 Python 理解 TypeScript

`import type { DecideGate } ...` 可以先理解成“导入函数必须遵守的格式说明”。type 不会在运行时自动验证网络 JSON。真实适配器仍须验证 GitHub 输入。

`export const decideGate: DecideGate = (...) => { ... }` 表示定义并导出一个函数，要求它遵守 DecideGate。Python 类比为：
```python
def decide_gate(analysis, risk, context, config):
    ...
    return {"state": "WAITING", "reasons": ["APPROVAL_REQUIRED"]}
```
这里的箭头是 JS 的函数写法；Python 的 `-> GateResult` 是返回类型注解，作用不同。

`Set` 类似 Python 的 set，用来去重；`Map` 类似 dict，用账号找到其有效决定。`some` 接近 any，`every` 接近 all，`filter` 接近列表推导式里的 if。`===` 是严格比较；`&&` 相当于 and；`||` 相当于 or。`return` 会立刻结束当前函数，不会继续执行后面的规则。

## 风险函数怎样思考

先验证配置、路径和增删行数。然后同时收集风险原因：

- 命中敏感路径：HIGH。包括删除文件、重命名的旧路径以及不支持分析的文件，防止通过换后缀绕过策略。
- 保留任何 high finding：HIGH。即使它无法定位，或其他文件检查失败，也不能抹去。HIGH 是审查优先级，不代表模型意见已被证实。
- 必要分析不完整：UNKNOWN。不能把“检查没成功”解释成“风险低”。
- 有已验证位置的 medium finding，或全 PR 规模达到配置阈值：MEDIUM。
- 其他情况：LOW。NOT_APPLICABLE 可以是 LOW，但不自动表示检查通过。

优先级为 HIGH → UNKNOWN → MEDIUM → LOW。规则阈值来自配置；这次沿用 Sprint 1 候选值，不宣称已通过真实数据调优。additions + deletions 是变动行数，两个条件用“或”：改动行数达标，或者文件数量达标，就触发规模风险。

hasCompleteCoverage 会重新核对支持文件与已检查文件、必要遗漏和 finding 验证状态，防止只改一个 COMPLETE 字符串就自动通过。

## 门禁函数怎样思考

1. 配置不合法：ERROR，人工批准也不能覆盖。
2. SHA 或作者等必需输入不合法：ERROR。
3. 被检查版本与 PR 当前版本不同：STALE，旧报告不能替新代码放行。
4. 风险版本、分析输入或审阅历史冲突：ERROR。
5. 有合格成员尚未解决的 CHANGES_REQUESTED：WAITING。
6. 分析完整且 LOW / MEDIUM：PASS。
7. 其他情况有足够合格批准：PASS，原因 HUMAN_APPROVED。
8. 批准不足：WAITING。

注意：HIGH + 人工批准可以 PASS，但风险仍然是 HIGH。UNKNOWN + 人工接管也不变成“模型确认安全”。

## 什么是有效批准

- 身份为人类 User；机器人不计。
- 当前权限至少 write；read / triage 不计。
- 不是 PR 作者，账号大小写不影响身份判断。
- APPROVED 对应被检查的当前 head SHA；旧版本批准不计。
- 同一个人只算一次；普通 COMMENTED 保留上一次决定。
- 后续 DISMISSED 清除这个人的决定；后续 APPROVED 可以解决自己的请求修改。
- 合格 CHANGES_REQUESTED 在后续提交仍阻止放行，直到该成员批准或撤销；这是本项目明确的保守策略。
- 按真实时间排序，再按 review ID 排序，不能按带时区的时间文本直接比较。

GitHub 当前 review 快照和事件历史不是一回事。相同 review ID 的完全相同记录可去重；冲突记录返回 ERROR，不能靠数组顺序猜谁是新的。A 必须按真实事件/最新 API 快照归一化撤销，传入当前权限，并在发布前重新取批准状态。

## D 与 A 的依赖

D 不查询 GitHub 权限，不原子锁定评论，不安装分支保护。GateContext 没有 repo/sourceRepo 字段，所以 fork 在拥有 ReviewInput 的 src/pipeline.ts 入口拦截，模型和读取端口不被调用。

A 仍需完成：可信 GitHub 审阅/权限适配器，同一 SHA 批准和撤销事件串行化，发布前重算，required status 实测。E 负责向用户解释风险、遗漏、版本和下一步。不要直接把不可信 PR 评论里的 PASS 文本当成决策。

## 测试到底证明什么

55 个共享场景在 D 边界重算风险和批准；另有独立反例及真实流水线注入测试。共享场景中的 B/C 分析结果作为受控输入，不是整条生产流水线已跑通，也不能当模型准确率。

## 两道理解题

1. 一个 PR 的风险为 HIGH，合格成员批准当前提交后，risk 和 gate 分别是什么？
2. reviewer-b 先 APPROVED，再 COMMENTED，最后 DISMISSED。此时批准还算数吗？如果 PR 又有新提交，旧 APPROVED 又该怎样处理？

回答后再继续逐段读源码。先从 risk.ts 的 calculateRisk 开始，不必一次看完所有文件。
