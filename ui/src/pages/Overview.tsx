import {
  ArrowDownToLine,
  BookOpen,
  CircleHelp,
  FlaskConical,
  GitBranch,
} from "lucide-react";
import { disposition, tokenTotal, type ReviewDataset } from "../domain/review";
import { providerNames } from "../components/ReviewCard";

export function Overview({ data }: { data: ReviewDataset }) {
  const providers = [...new Set(data.records.map((r) => r.provider))];
  const median = (values: number[]) => {
    const s = [...values].sort((a, b) => a - b);
    return s.length
      ? (s[Math.floor((s.length - 1) / 2)] + s[Math.floor(s.length / 2)]) / 2
      : 0;
  };
  function exportSnapshot() {
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = `ainspector-snapshot-${data.date}.json`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return (
    <>
      <div className="page-title">
        <div>
          <div className="eyebrow">EXPERIMENT NOTES</div>
          <h1>
            小样本，透明记录<span>。</span>
          </h1>
          <p>从真实记录出发，把技术成功与意见质量分开看。</p>
        </div>
        <button className="secondary-button" onClick={exportSnapshot}>
          <ArrowDownToLine size={16} />
          导出当前快照
        </button>
      </div>
      <div className="overview-intro panel">
        <FlaskConical size={28} />
        <div>
          <h2>6 个案例 × 3 个模型 = 18 条样本</h2>
          <p>
            虚构的 TypeScript 变更，覆盖 3 个预设缺陷、2 个正常改动和 1
            个上下文不足案例。每题采样一次；数据反映本次接入配置，不是通用模型排行榜。
          </p>
        </div>
        <span className="pill neutral">{data.date}</span>
      </div>
      <div className="metrics-grid">
        {providers.map((p) => {
          const rows = data.records.filter((r) => r.provider === p);
          const defects = rows.filter(
            (r) =>
              data.cases.find((c) => c.id === r.case_id)?.kind === "defect",
          );
          const clean = rows.filter(
            (r) => data.cases.find((c) => c.id === r.case_id)?.kind === "clean",
          );
          const boundary = rows.find((r) => r.case_id === "context-boundary");
          return (
            <article className="panel model-metrics" key={p}>
              <span className={`model-avatar ${p}`}>
                {p === "deepseek" ? "D" : p === "minimax" ? "M" : "G"}
              </span>
              <h2>{providerNames[p] ?? p}</h2>
              <div className="big-metric">
                {defects.some((r) => !r.reviewer_grade)
                  ? "待评分"
                  : defects.filter(
                      (r) => r.reviewer_grade?.hit_expected_issue === "yes",
                    ).length}
                <span> / {defects.length}</span>
              </div>
              <p>预设缺陷命中</p>
              <dl>
                <div>
                  <dt>技术成功</dt>
                  <dd>
                    {rows.filter((r) => r.status === "valid").length} /{" "}
                    {rows.length}
                  </dd>
                </div>
                <div>
                  <dt>正常改动的缺陷误报</dt>
                  <dd>
                    {clean.some((r) => !r.reviewer_grade)
                      ? "待评分"
                      : clean.reduce(
                          (s, r) => s + r.reviewer_grade!.false_positive_count,
                          0,
                        )}{" "}
                    / {clean.length} 条样本
                  </dd>
                </div>
                <div>
                  <dt>上下文边界判断</dt>
                  <dd
                    className={
                      boundary?.reviewer_grade?.context_calibrated
                        ? "text-green"
                        : "text-amber"
                    }
                  >
                    {boundary?.reviewer_grade?.context_calibrated === undefined
                      ? "未评分"
                      : boundary.reviewer_grade.context_calibrated
                        ? "通过"
                        : "未通过"}
                  </dd>
                </div>
                <div>
                  <dt>耗时中位数</dt>
                  <dd>
                    {(
                      Math.round(median(rows.map((r) => r.total_ms))) / 1000
                    ).toFixed(3)}{" "}
                    s
                  </dd>
                </div>
                <div>
                  <dt>总 token</dt>
                  <dd>
                    {tokenTotal(rows)?.toLocaleString("zh-CN") ?? "用量不完整"}
                  </dd>
                </div>
                <div>
                  <dt>纯风格意见 / 解释错误</dt>
                  <dd>
                    {
                      rows.filter((r) => r.reviewer_grade?.style_only_comment)
                        .length
                    }{" "}
                    /{" "}
                    {rows.reduce(
                      (s, r) =>
                        s + (r.reviewer_grade?.explanation_error_count ?? 0),
                      0,
                    )}
                  </dd>
                </div>
              </dl>
            </article>
          );
        })}
      </div>
      <div className="notes-grid">
        <section className="panel note-panel">
          <BookOpen size={20} />
          <h2>怎样阅读评分</h2>
          <p>
            评分由 Codex 逐条对照参考答案完成，属于 AI
            辅助审阅，尚未经独立人类盲评。
          </p>
          <ul>
            <li>缺陷命中：只针对 3 个预设缺陷案例。</li>
            <li>误报：缺乏代码依据的具体缺陷断言。</li>
            <li>
              可操作性：0 无法操作；1 方向合理但不明确；2 有具体且可行的修复。
            </li>
            <li>正常改动和上下文不足案例不计算缺陷命中。</li>
          </ul>
        </section>
        <section className="panel note-panel">
          <CircleHelp size={20} />
          <h2>结论的边界</h2>
          <p>
            评测直接调用 Chat.codeReview，未经过 Bot 的文件过滤、评论发布或真实
            PR 流程。
          </p>
          <p>
            MiniMax 关闭思考且没有启用 JSON
            mode；各模型的推理策略不完全一致。耗时受网络和服务负载影响，token
            分词口径也不同。
          </p>
          <p>返回格式正确、模型给出 LGTM、修改本身安全，是三个不同判断。</p>
        </section>
      </div>
      <div className="source-note">
        <GitBranch size={14} />
        数据来源：<code>{data.source}/records.json</code> ·{" "}
        {data.records.filter((r) => disposition(r) !== "error").length}{" "}
        条可阅读记录
      </div>
    </>
  );
}
