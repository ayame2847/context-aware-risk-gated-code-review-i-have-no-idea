import {
  Check,
  FileCode2,
  LockKeyhole,
  RotateCcw,
  ShieldCheck,
  SlidersHorizontal,
} from "lucide-react";

export function Extension() {
  const steps = [
    {
      icon: SlidersHorizontal,
      title: "规则与模型",
      text: "自定义规则与模型分别输出发现，记录证据、来源和版本。",
      state: "待接入",
    },
    {
      icon: ShieldCheck,
      title: "风险判断",
      text: "结合变更影响、证据与检查结果评估风险；缺少上下文时明确保留判断。",
      state: "未评估",
    },
    {
      icon: FileCode2,
      title: "补丁预览",
      text: "建议转为可查看的 diff，先校验目标版本、范围与测试结果，再确认应用。",
      state: "待实现",
    },
    {
      icon: RotateCcw,
      title: "应用与撤回",
      text: "保留修改前后的版本。撤回前检查后续改动，避免覆盖新的工作。",
      state: "待实现",
    },
  ];
  return (
    <>
      <div className="page-title">
        <div>
          <div className="eyebrow">BUILT TO GROW</div>
          <h1>
            从看懂意见，到可靠修改<span>。</span>
          </h1>
          <p>第一版把阅读做好，后续能力逐步接入。</p>
        </div>
        <span className="pill readonly">
          <LockKeyhole size={12} />
          当前仅开放阅读
        </span>
      </div>
      <section className="capability-banner">
        <div className="capability-symbol">
          <ShieldCheck size={38} />
        </div>
        <div>
          <h2>
            修改风险评级 <span>未评估</span>
          </h2>
          <p>
            现有样本没有可验证的安全系数。缺陷命中率与模型的确定语气，都不能直接转换为修改安全分数。
          </p>
        </div>
      </section>
      <div className="extension-steps">
        {steps.map((s, i) => (
          <section className="panel step-card" key={s.title}>
            <div className="step-head">
              <s.icon size={21} />
              <span>0{i + 1}</span>
            </div>
            <h2>{s.title}</h2>
            <p>{s.text}</p>
            <span className="pill neutral">{s.state}</span>
          </section>
        ))}
      </div>
      <section className="panel note-panel extension-notes">
        <h2>当前可以做什么</h2>
        <div className="capability-list">
          <span>
            <Check size={16} />
            浏览实际评测记录
          </span>
          <span>
            <Check size={16} />
            比较模型意见与评分
          </span>
          <span>
            <Check size={16} />
            查看代码 diff 与行定位
          </span>
          <span>
            <Check size={16} />
            导出只读数据快照
          </span>
        </div>
        <p>
          动态
          API、规则执行、文件写入与撤回尚未实现。当前界面不会触发这些操作；相关的数据类型与数据读取接口已预留。
        </p>
      </section>
      <section className="panel note-panel">
        <h2>建议先使用风险等级，再讨论安全分数</h2>
        <p>
          “低 / 中 / 高风险 + 依据 +
          未知项”比一个看似精确的百分数更容易复核。未来评分策略应由团队共同确定，记录规则版本，并用真实案例校准。即使评级为低风险，也不代表经过安全证明。
        </p>
      </section>
    </>
  );
}
