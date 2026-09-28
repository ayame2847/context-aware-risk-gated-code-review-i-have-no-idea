import { FileCode2, Minus, Plus, MessageSquare } from "lucide-react";
import { parseDiff } from "../domain/diff";

export function DiffView({
  patch,
  filename,
  highlighted,
}: {
  patch: string;
  filename: string;
  highlighted: number | null;
}) {
  const lines = parseDiff(patch);
  const added = lines.filter((l) => l.kind === "added").length;
  const removed = lines.filter((l) => l.kind === "removed").length;
  return (
    <section className="panel diff-panel" aria-label="代码变更">
      <header className="panel-heading">
        <span>
          <FileCode2 size={16} />
          <code>{filename}</code>
        </span>
        <span className="diff-count">
          <b>+{added}</b>
          <em>−{removed}</em>
        </span>
      </header>
      <div className="diff-legend">
        <span>旧行 / 新行</span>
        <span>统一差异视图 · TypeScript</span>
      </div>
      <div
        className="diff-scroll"
        tabIndex={0}
        aria-label="代码差异，可横向滚动"
      >
        <table className="diff-table">
          <tbody>
            {lines.map((line, i) => (
              <tr
                key={i}
                id={`diff-row-${i}`}
                className={`${line.kind} ${highlighted === i ? "located" : ""}`}
              >
                <td className="line-number">{line.oldLine ?? ""}</td>
                <td className="line-number">{line.newLine ?? ""}</td>
                <td className="line-sign">
                  {line.kind === "added" ? (
                    <Plus size={12} aria-label="新增" />
                  ) : line.kind === "removed" ? (
                    <Minus size={12} aria-label="删除" />
                  ) : highlighted === i ? (
                    <MessageSquare size={12} />
                  ) : null}
                </td>
                <td className="code-text">
                  <code>{line.text || " "}</code>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <footer className="diff-footer">
        <span>
          <i className="dot green" />
          新增
        </span>
        <span>
          <i className="dot red" />
          删除
        </span>
        <span>仅展示当前变更片段</span>
      </footer>
    </section>
  );
}
