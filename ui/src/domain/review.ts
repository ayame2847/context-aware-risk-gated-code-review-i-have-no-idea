import { z } from "zod";

export const caseSchema = z.object({
  id: z.string().min(1),
  title: z.string(),
  kind: z.enum(["defect", "clean", "context-limited"]),
  filename: z.string(),
  patch: z.string(),
  expected: z.string(),
  rubric: z.string(),
});
const gradeSchema = z.object({
  hit_expected_issue: z.enum(["yes", "no", "N/A"]),
  false_positive_count: z.number().int().nonnegative(),
  actionability_0_to_2: z.union([
    z.literal(0),
    z.literal(1),
    z.literal(2),
    z.literal("N/A"),
  ]),
  notes: z.string(),
  context_calibrated: z.boolean().optional(),
  style_only_comment: z.boolean().optional(),
  explanation_error_count: z.number().int().nonnegative().optional(),
});
export const recordSchema = z.object({
  record_id: z.string(),
  run_id: z.string(),
  provider: z.string(),
  case_id: z.string(),
  requested_model: z.string(),
  returned_model: z.string().nullable(),
  repetition: z.number().int().positive(),
  started_at: z.string(),
  status: z.string(),
  total_ms: z.number().nonnegative(),
  input_tokens: z.number().nonnegative().nullable(),
  output_tokens: z.number().nonnegative().nullable(),
  total_tokens: z.number().nonnegative().nullable(),
  prompt_sha256: z.string(),
  reviews: z.array(
    z.object({
      hunk_header: z.string().optional(),
      lgtm: z.boolean(),
      review_comment: z.string(),
    }),
  ),
  reviewer_grade: gradeSchema.nullable(),
});
export type ReviewCase = z.infer<typeof caseSchema>;
export type ReviewRecord = z.infer<typeof recordSchema>;
export type ReviewComment = ReviewRecord["reviews"][number];
export interface ReviewDataset {
  cases: ReviewCase[];
  records: ReviewRecord[];
  date: string;
  source: string;
}

/** UI depends on this read interface; future HTTP sources must validate at the same boundary. */
export interface ReviewRepository {
  load(signal?: AbortSignal): Promise<ReviewDataset>;
}

export function parseSnapshot(
  rawCases: unknown,
  rawRecords: unknown,
): ReviewDataset {
  const cases = z.array(caseSchema).min(1).parse(rawCases);
  const records = z.array(recordSchema).min(1).parse(rawRecords);
  const ids = new Set(cases.map((c) => c.id));
  if (ids.size !== cases.length) throw new Error("案例 ID 重复");
  const keys = new Set<string>();
  for (const r of records) {
    if (!ids.has(r.case_id))
      throw new Error(`记录关联了不存在的案例：${r.case_id}`);
    // This curated snapshot has one sample for each case/provider. Never silently choose a repeat.
    const key = JSON.stringify([r.case_id, r.provider]);
    if (keys.has(key))
      throw new Error("同一案例与模型有多个样本；请先选择一个实验快照");
    keys.add(key);
  }
  return {
    cases,
    records,
    date: "2026-09-28",
    source: "docs/progress/2026-09-28",
  };
}

export function disposition(
  r: ReviewRecord,
): "issue" | "lgtm" | "error" | "empty" {
  if (r.status !== "valid") return "error";
  if (!r.reviews.length) return "empty";
  return r.reviews.every((v) => v.lgtm) ? "lgtm" : "issue";
}

export function tokenTotal(records: ReviewRecord[]): number | null {
  return records.some((r) => r.total_tokens === null)
    ? null
    : records.reduce((sum, r) => sum + r.total_tokens!, 0);
}

/** Extension contracts only. No risk engine or file-changing implementation is installed. */
export type RiskAssessment =
  | { status: "not-evaluated"; reason: string }
  | { status: "insufficient-evidence"; missingContext: string[] }
  | {
      status: "evaluated";
      level: "low" | "medium" | "high";
      policyVersion: string;
      baseCommit: string;
      evidence: {
        source: "rule" | "model" | "test";
        reference: string;
        rationale: string;
      }[];
    };
export interface PatchProposal {
  id: string;
  baseCommit: string;
  unifiedDiff: string;
  files: { path: string; beforeHash: string; afterHash: string }[];
  evidenceRefs: string[];
  state: "draft" | "validated" | "applied" | "reverted";
}
