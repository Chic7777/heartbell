// 履约分纯函数（计划书 4.3 节计分规则 V1）。
// 只依据已结算承诺计算，不预测诚信、不输出人品等级。
import type { PromiseDoc, TrustComputation, PromiseResolutionResult } from "./v2-types";

export const TRUST_ALGORITHM_VERSION = "trust-v1";
export const MIN_SETTLED = 3;          // n >= 3 才出分
export const MIN_COVERAGE = 0.8;       // coverage >= 0.8 才出分
export const MAX_SCORING_PROMISES = 10; // 每段关系计分承诺上限
export const MAX_SCORING_PER_DAY = 1;   // 每个自然日至多新增 1 项计分承诺

export interface ScoringItem { result: PromiseResolutionResult; settled: boolean }

// 平滑公式：score = round(100 × (s + 1) / (n + 2))，n = s + f。
export function smoothScore(s: number, f: number): number | null {
  const n = s + f;
  if (n < MIN_SETTLED) return null;
  return Math.round((100 * (s + 1)) / (n + 2));
}

// 从一段关系的计分承诺计算某位成员的履约参考。
// 只有双方确认生效（status=active）且已结算/待结算的计分项参与；waived 排除。
export function computeTrust(
  subjectId: string,
  sourceRelationId: string | null,
  promises: PromiseDoc[],
  now: number,
): TrustComputation {
  const base: TrustComputation = {
    subjectId, sourceRelationId, s: 0, f: 0, pending: 0, disputed: 0, waived: 0,
    eligible: 0, settled: 0, coverage: 0, score: null,
    reason: "no_history", algorithmVersion: TRUST_ALGORITHM_VERSION, asOf: now,
  };
  if (!sourceRelationId) return base;
  let s = 0, f = 0, pending = 0, disputed = 0, waived = 0;
  for (const promise of promises) {
    if (promise.relationshipId !== sourceRelationId || !promise.scoringOptIn) continue;
    if (promise.status !== "active") continue;
    // 双方共同负责的承诺：全部责任人结算才算入对应成员
    const results = promise.responsibleUserIds.map(uid => promise.resolutions[uid]?.result ?? "pending");
    const counts: Record<string, number> = { fulfilled: 0, unfulfilled: 0, pending: 0, disputed: 0, waived: 0 };
    for (const r of results) counts[r] += 1;
    if (!promise.responsibleUserIds.includes(subjectId)) continue;
    // 该成员自己的结果进入计算；若承诺需双方各自履约，则取本人项。
    const own = promise.resolutions[subjectId]?.result ?? "pending";
    if (own === "fulfilled") s += 1;
    else if (own === "unfulfilled") f += 1;
    else if (own === "pending") pending += 1;
    else if (own === "disputed") { pending += 1; disputed += 1; }
    else if (own === "waived") waived += 1;
    void counts;
  }
  const eligible = s + f + pending;
  const settled = s + f;
  const coverage = eligible > 0 ? settled / eligible : 0;
  let score: number | null = null;
  let reason: TrustComputation["reason"] = "ok";
  if (settled < MIN_SETTLED) reason = "insufficient_sample";
  else if (coverage < MIN_COVERAGE) reason = "low_coverage";
  else if (disputed > 0) reason = "disputed_pending"; // 可能改变结果的未决申诉
  else { score = smoothScore(s, f); reason = "ok"; }
  return { ...base, s, f, pending, disputed, waived, eligible, settled, coverage, score, reason, asOf: now };
}

export const trustReasonLabels: Record<TrustComputation["reason"], string> = {
  ok: "",
  no_history: "暂无足够记录：还没有已结束的正式关系。",
  insufficient_sample: "样本不足：已结算承诺不足 3 项，不显示分数。",
  low_coverage: "覆盖率不足：待结算承诺过多，暂不显示分数。",
  disputed_pending: "申诉处理中：存在可能改变结果的未决申诉。",
  active_only: "当前关系不对外评分。",
};
