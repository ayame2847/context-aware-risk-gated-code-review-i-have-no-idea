import {
  Check,
  CircleAlert,
  Clock3,
  CornerDownLeft,
  Info,
  Layers3,
  Quote,
} from "lucide-react";
import type { ReviewCase, ReviewRecord } from "../domain/review";
import { disposition } from "../domain/review";
import { locateComment } from "../domain/diff";
import Markdown from "react-markdown";

export const providerNames: Record<string, string> = {
  deepseek: "DeepSeek V4 Pro",
  "gemini-lite": "Gemini Flash Lite",
  minimax: "MiniMax M3",
};
export function Text({ text }: { text: string }) {
  return (
    <div className="review-text">
      <Markdown
        skipHtml
        components={{
          a: ({ children }) => <span>{children}</span>,
          img: ({ alt }) => <span>{alt ?? "图片未加载"}</span>,
        }}
      >
        {text}
      </Markdown>
    </div>
  );
}
export function ReviewCard({
  record,
  item,
  onLocate,
  compact = false,
}: {
  record: ReviewRecord;
  item: ReviewCase;
  onLocate?: (row: number) => void;
  compact?: boolean;
}) {
  const state = disposition(record),
    grade = record.reviewer_grade;
  const labels = {
    issue: "有审查意见",
    lgtm: "未提出问题",
    error: "调用未成功",
    empty: "无审查内容",
  };
  return (
    <article className={`review-card panel ${compact ? "compact" : ""}`}>
      <header className="review-card-head">
        <span className={`model-avatar ${record.provider}`}>
          {record.provider === "deepseek"
            ? "D"
            : record.provider === "minimax"
              ? "M"
              : "G"}
        </span>
        <div>
          <h3>{providerNames[record.provider] ?? record.provider}</h3>
          <span className="model-id">
            {record.returned_model ?? record.requested_model}
          </span>
        </div>
        <span
          className={`pill ${state === "lgtm" ? "success" : state === "issue" ? "neutral" : "warning"}`}
        >
          {labels[state]}
        </span>
      </header>
      <div className="review-content">
        {state === "error" ? (
          <div className="empty-review">
            <CircleAlert size={23} />
            <b>没有可用的审查结论</b>
            <p>技术状态：{record.status}。请求失败不能当成代码通过审查。</p>
          </div>
        ) : state === "empty" ? (
          <div className="empty-review">
            <Info size={23} />
            <b>此记录未返回审查意见</b>
            <p>没有内容不等于代码已被验证。</p>
          </div>
        ) : state === "lgtm" ? (
          <div className="empty-review">
            <span className="check-circle">
              <Check size={22} />
            </span>
            <b>模型未提出问题</b>
            <p>
              LGTM 表示本次模型没有提出问题，
              <br />
              不代表修改已通过安全验证。
            </p>
          </div>
        ) : (
          <>
            {record.reviews.map((review, i) => {
              const location = locateComment(review.hunk_header, item.patch);
              return (
                <div className="opinion" key={i}>
                  <div className="opinion-label">
                    <Quote size={14} />
                    <span>
                      模型原文 {record.reviews.length > 1 ? i + 1 : ""}
                    </span>
                  </div>
                  <Text text={review.review_comment || "此条评论为空。"} />
                  {location ? (
                    <button
                      className="location-button"
                      disabled={!onLocate}
                      onClick={() => onLocate?.(location.row)}
                    >
                      <CornerDownLeft size={13} />
                      {location.side === "LEFT" ? "旧文件" : "新文件"} L
                      {location.line} · 片段末行定位参考
                    </button>
                  ) : (
                    <span className="location-note">
                      未提供可验证的行定位 · 按整段阅读
                    </span>
                  )}
                </div>
              );
            })}
          </>
        )}
        {grade && state !== "error" && (
          <section className="grade-box">
            <div className="grade-heading">
              <Layers3 size={15} />
              <b>评分与依据</b>
              <span>AI 辅助评分</span>
            </div>
            <div className="grade-stats">
              <span>
                缺陷命中{" "}
                <b>
                  {grade.hit_expected_issue === "N/A"
                    ? "不适用"
                    : grade.hit_expected_issue === "yes"
                      ? "是"
                      : "否"}
                </b>
              </span>
              <span>
                无依据缺陷断言 <b>{grade.false_positive_count}</b>
              </span>
              <span>
                建议可操作性{" "}
                <b>
                  {grade.actionability_0_to_2 === "N/A"
                    ? "不适用"
                    : `${grade.actionability_0_to_2} / 2`}
                </b>
              </span>
            </div>
            <p>{grade.notes}</p>
            {(grade.context_calibrated !== undefined ||
              grade.style_only_comment ||
              !!grade.explanation_error_count) && (
              <div className="grade-flags">
                {grade.context_calibrated !== undefined && (
                  <span
                    className={`pill ${grade.context_calibrated ? "success" : "warning"}`}
                  >
                    上下文边界：{grade.context_calibrated ? "通过" : "未通过"}
                  </span>
                )}
                {grade.style_only_comment && (
                  <span className="pill warning">纯风格意见</span>
                )}
                {!!grade.explanation_error_count && (
                  <span className="pill warning">
                    {grade.explanation_error_count} 处解释错误
                  </span>
                )}
              </div>
            )}
          </section>
        )}
        {!grade && <p className="muted">此样本尚无评分。</p>}
      </div>
      <footer className="review-meta">
        <span>
          <Clock3 size={13} />
          {(record.total_ms / 1000).toFixed(2)} s
        </span>
        <span>
          {record.total_tokens?.toLocaleString("zh-CN") ?? "未知"} tokens
        </span>
        <span>采样 × {record.repetition}</span>
      </footer>
    </article>
  );
}
