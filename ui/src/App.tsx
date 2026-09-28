import { useEffect, useState } from "react";
import {
  Activity,
  ArrowRight,
  BookOpen,
  Braces,
  ChevronRight,
  CircleHelp,
  Columns2,
  FileCode2,
  GitBranch,
  Layers3,
  LayoutDashboard,
  LockKeyhole,
  PanelLeft,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  X,
} from "lucide-react";
import { snapshotRepository } from "./data/snapshot";
import { type ReviewDataset, type ReviewRepository } from "./domain/review";
import { DiffView } from "./components/DiffView";
import { ReviewCard, Text } from "./components/ReviewCard";

import { Overview } from "./pages/Overview";
import { Extension } from "./pages/Extension";

type Page = "review" | "overview" | "extension";
const kinds: Record<string, string> = {
  defect: "预设缺陷",
  clean: "正常改动",
  "context-limited": "上下文不足",
};

export function App({
  repository = snapshotRepository,
}: {
  repository?: ReviewRepository;
}) {
  const [data, setData] = useState<ReviewDataset | null>(null);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [page, setPage] = useState<Page>("review");
  const [caseId, setCaseId] = useState("auth-delete");
  const [provider, setProvider] = useState("deepseek");
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState("all");
  const [compare, setCompare] = useState(false);
  const [highlighted, setHighlighted] = useState<number | null>(null);
  const [sidebar, setSidebar] = useState(false);

  useEffect(() => {
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSidebar(false);
    };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    setError("");
    setData(null);
    repository
      .load(controller.signal)
      .then((value) => {
        if (!controller.signal.aborted) {
          setData(value);
          setCaseId(
            value.cases.some((c) => c.id === "auth-delete")
              ? "auth-delete"
              : value.cases[0].id,
          );
        }
      })
      .catch((reason) => {
        if (!controller.signal.aborted)
          setError(reason instanceof Error ? reason.message : "未知数据错误");
      });
    return () => controller.abort();
  }, [repository, attempt]);

  if (!data)
    return (
      <main className="load-screen">
        <span className="brand-mark">
          <Braces size={26} />
        </span>
        <h1>Ainspector</h1>
        {error ? (
          <>
            <h2>评测记录暂时无法读取</h2>
            <p role="alert">{error}</p>
            <button
              className="primary-button"
              onClick={() => setAttempt((a) => a + 1)}
            >
              重新加载
            </button>
          </>
        ) : (
          <p role="status">正在加载评测快照…</p>
        )}
      </main>
    );

  const filtered = data.cases.filter(
    (c) =>
      (kind === "all" || kind === c.kind) &&
      `${c.title} ${c.filename} ${c.id}`
        .toLowerCase()
        .includes(query.trim().toLowerCase()),
  );
  const item = filtered.find((c) => c.id === caseId) ?? filtered[0];
  const providers = [...new Set(data.records.map((r) => r.provider))];
  const caseRecords = item
    ? data.records.filter((r) => r.case_id === item.id)
    : [];
  const record = caseRecords.find((r) => r.provider === provider);
  function chooseCase(id: string) {
    setCaseId(id);
    setHighlighted(null);
    setSidebar(false);
    setPage("review");
  }
  function navigate(next: Page) {
    setPage(next);
    setSidebar(false);
  }
  function locate(row: number) {
    setHighlighted(row);
    document
      .getElementById(`diff-row-${row}`)
      ?.scrollIntoView({ behavior: "smooth", block: "center" });
  }
  function clearFilters() {
    setQuery("");
    setKind("all");
    setHighlighted(null);
  }

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">
        跳至主要内容
      </a>
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark">
            <Braces size={23} />
          </span>
          <strong>
            Ainspector<span> / </span>
          </strong>
          <span className="brand-sub">Review workspace</span>
        </div>
        <div className="topbar-right">
          <span className="snapshot-state">
            <i className="dot green" />
            本地评测快照
          </span>
          <span className="pill readonly">
            <LockKeyhole size={12} />
            只读原型
          </span>
          <span className="avatar">AY</span>
        </div>
        <button
          className="mobile-menu icon-button"
          aria-label="展开案例导航"
          aria-expanded={sidebar}
          aria-controls="case-navigation"
          onClick={() => setSidebar((v) => !v)}
        >
          <PanelLeft size={20} />
        </button>
      </header>
      {sidebar && (
        <button
          className="sidebar-backdrop"
          aria-label="关闭导航"
          onClick={() => setSidebar(false)}
        />
      )}
      <aside
        id="case-navigation"
        className={`sidebar ${sidebar ? "open" : ""}`}
      >
        <div className="workspace-label">
          <span className="workspace-icon">A</span>
          <div>
            <b>个人研究工作区</b>
            <small>代码审查 · 多模型评测</small>
          </div>
        </div>
        <nav className="main-nav" aria-label="主导航">
          <button
            className={page === "review" ? "active" : ""}
            aria-current={page === "review" ? "page" : undefined}
            onClick={() => navigate("review")}
          >
            <FileCode2 size={17} />
            审查工作台<span className="nav-count">{data.cases.length}</span>
          </button>
          <button
            className={page === "overview" ? "active" : ""}
            aria-current={page === "overview" ? "page" : undefined}
            onClick={() => navigate("overview")}
          >
            <LayoutDashboard size={17} />
            实验概览
          </button>
          <button
            className={page === "extension" ? "active" : ""}
            aria-current={page === "extension" ? "page" : undefined}
            onClick={() => navigate("extension")}
          >
            <Layers3 size={17} />
            能力与扩展
          </button>
        </nav>
        <div className="case-nav-head">
          <span>评测案例</span>
          <span>
            {filtered.length} / {data.cases.length}
          </span>
        </div>
        <label className="search">
          <Search size={15} />
          <input
            aria-label="搜索案例"
            placeholder="搜索案例或文件…"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setHighlighted(null);
            }}
          />
          {query && (
            <button
              aria-label="清空搜索"
              onClick={() => {
                setQuery("");
                setHighlighted(null);
              }}
            >
              <X size={13} />
            </button>
          )}
        </label>
        <label className="filter-select">
          <SlidersHorizontal size={13} />
          <select
            aria-label="筛选案例类型"
            value={kind}
            onChange={(e) => {
              setKind(e.target.value);
              setHighlighted(null);
            }}
          >
            <option value="all">全部案例类型</option>
            {Object.entries(kinds).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <div className="case-list">
          {filtered.map((c, index) => (
            <button
              key={c.id}
              className={`case-item ${page === "review" && item?.id === c.id ? "selected" : ""}`}
              aria-pressed={page === "review" && item?.id === c.id}
              onClick={() => chooseCase(c.id)}
            >
              <span className={`case-symbol ${c.kind}`}>
                <FileCode2 size={16} />
              </span>
              <span>
                <b>{c.title}</b>
                <small>{c.filename}</small>
              </span>
              <span className="case-index">
                {String(index + 1).padStart(2, "0")}
              </span>
            </button>
          ))}
          {!filtered.length && (
            <div className="nav-empty">
              没有匹配的案例<button onClick={clearFilters}>重置筛选</button>
            </div>
          )}
        </div>
        <div className="sidebar-bottom">
          <div>
            <GitBranch size={14} />
            <span>个人 UI 原型</span>
          </div>
          <p>
            实验日期 {data.date}
            <br />6 个虚构 patch · 每模型每题 1 次
          </p>
        </div>
      </aside>
      <main className="main-content" id="main-content">
        <div className="breadcrumb">
          <span>个人工作区</span>
          <ChevronRight size={13} />
          <span>
            {page === "review"
              ? "审查工作台"
              : page === "overview"
                ? "实验概览"
                : "能力与扩展"}
          </span>
          <span className="breadcrumb-date">
            {data.date.replaceAll("-", ".")}
          </span>
        </div>
        {page === "review" ? (
          <>
            <div className="page-title">
              <div>
                <div className="eyebrow">REVIEW EXPLORER</div>
                <h1>
                  让每条审查意见，有据可循<span>。</span>
                </h1>
                <p>对照代码变更，理解模型判断，再核对评分依据。</p>
              </div>
              <button
                className={`secondary-button ${compare ? "pressed" : ""}`}
                aria-pressed={compare}
                onClick={() => setCompare((v) => !v)}
              >
                <Columns2 size={16} />
                {compare ? "返回单模型" : "对照三个模型"}
              </button>
            </div>
            <div className="summary-strip">
              <div>
                <span className="summary-icon">
                  <FileCode2 size={18} />
                </span>
                <strong>{data.cases.length}</strong>
                <span>评测案例</span>
              </div>
              <div>
                <span className="summary-icon">
                  <Sparkles size={18} />
                </span>
                <strong>{providers.length}</strong>
                <span>已接入模型</span>
              </div>
              <div>
                <span className="summary-icon">
                  <Activity size={18} />
                </span>
                <strong>{data.records.length}</strong>
                <span>真实调用记录</span>
              </div>
              <div className="risk-summary">
                <ShieldCheck size={18} />
                <span>修改风险评级</span>
                <span className="pill neutral">未评估</span>
              </div>
            </div>
            {item ? (
              <>
                <div className="case-title">
                  <div>
                    <span className={`case-kind ${item.kind}`}>
                      {kinds[item.kind]}
                    </span>
                    <h2>{item.title}</h2>
                    <span className="case-id">{item.id}</span>
                  </div>
                  <span className="muted small">案例标签来自预设答案</span>
                </div>
                {compare ? (
                  <>
                    <DiffView
                      patch={item.patch}
                      filename={item.filename}
                      highlighted={highlighted}
                    />
                    <div className="section-title">
                      <h2>同一段代码，三个视角</h2>
                      <span>意见全文与评分逐项对照</span>
                    </div>
                    <div className="compare-grid">
                      {caseRecords.map((r) => (
                        <ReviewCard
                          key={r.provider}
                          record={r}
                          item={item}
                          onLocate={locate}
                          compact
                        />
                      ))}
                    </div>
                  </>
                ) : (
                  <div className="review-layout">
                    <div className="code-column">
                      <DiffView
                        patch={item.patch}
                        filename={item.filename}
                        highlighted={highlighted}
                      />
                      <section className="reference-box">
                        <div>
                          <BookOpen size={17} />
                          <h3>参考判断</h3>
                          <span>评测答案</span>
                        </div>
                        <Text text={item.expected} />
                        <details>
                          <summary>展开评分标准</summary>
                          <p>{item.rubric}</p>
                        </details>
                      </section>
                      <div className="method-note">
                        <CircleHelp size={15} />
                        <p>
                          这些案例用于观察模型表现。评论定位沿用项目的“片段末行”规则，并不代表问题精确发生在该行。
                        </p>
                      </div>
                    </div>
                    <div className="opinion-column">
                      <div
                        className="model-tabs"
                        role="group"
                        aria-label="选择模型"
                      >
                        {providers.map((p) => (
                          <button
                            key={p}
                            aria-pressed={provider === p}
                            className={provider === p ? "active" : ""}
                            onClick={() => {
                              setProvider(p);
                              setHighlighted(null);
                            }}
                          >
                            {p === "deepseek"
                              ? "DeepSeek"
                              : p === "gemini-lite"
                                ? "Gemini"
                                : p === "minimax"
                                  ? "MiniMax"
                                  : p}
                          </button>
                        ))}
                      </div>
                      {record ? (
                        <ReviewCard
                          record={record}
                          item={item}
                          onLocate={locate}
                        />
                      ) : (
                        <div className="panel no-results">
                          此模型没有该案例的记录。
                        </div>
                      )}
                    </div>
                  </div>
                )}
                {compare && (
                  <section className="reference-box">
                    <div>
                      <BookOpen size={17} />
                      <h3>参考判断</h3>
                    </div>
                    <Text text={item.expected} />
                  </section>
                )}
              </>
            ) : (
              <div className="no-results panel">
                <Search size={32} />
                <h2>没有找到匹配案例</h2>
                <p>尝试其他关键词，或清除类型筛选。</p>
                <button className="secondary-button" onClick={clearFilters}>
                  重置筛选
                </button>
              </div>
            )}
            <footer className="page-footer">
              <span>
                <LockKeyhole size={13} />
                只读浏览 · 不调用 API · 不修改代码
              </span>
              <button onClick={() => navigate("overview")}>
                了解实验与评分方式
                <ArrowRight size={14} />
              </button>
            </footer>
          </>
        ) : page === "overview" ? (
          <Overview data={data} />
        ) : (
          <Extension />
        )}
      </main>
    </div>
  );
}
