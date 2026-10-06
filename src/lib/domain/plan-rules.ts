// 相守计划纯规则（计划书 6.2/6.3 节）。P0 全部为演示点数，不可购买/提现/转让。
import type { CommitmentPlan, PlanStatus, RewardChoice } from "./v2-types";

export const PLAN_TERMS_VERSION = "plan-terms-v1";
export const INITIAL_DEMO_BALANCE = 1000;   // 每个演示用户初始演示点数
export const INVEST_PER_USER = 100;         // 每人投入
export const REWARD_POINTS_EACH = 50;       // 奖励 A：每人 50 点
export const REWARD_POINTS_BUDGET = 100;    // 奖励预留（2 × 50）
export const PLAN_INVITE_HOURS = 72;        // 加入邀请有效期
export const COOLING_HOURS = 24;            // 冷静期
export const VALID_DAYS = 365;              // 有效期
export const GRACE_DAYS = 30;               // 到期宽限
export const FORFEIT_WINDOW_DAYS = 7;       // 普通结束异议窗口
export const CLAIM_APPEAL_DAYS = 7;         // 审核通过后的争议期
export const REVIEW_LIMIT_DAYS = 7;         // 审核处理期限
export const SUPPLEMENT_LIMIT_DAYS = 14;    // 补正期限
export const EXCEPTION_LIMIT_DAYS = 30;     // 例外复核期限
export const REWARD_POOL_START = 10_000;    // 演示奖励池初始点数（系统发放）
export const ROSE_TICKET_STOCK = 20;        // 演示玫瑰券库存

export const HOUR = 3_600_000;
export const DAY = 24 * HOUR;

export function planInviteExpiry(invitedAt: number): number {
  return invitedAt + PLAN_INVITE_HOURS * HOUR;
}
export function planCoolingEnd(activatedAt: number): number {
  return activatedAt + COOLING_HOURS * HOUR;
}
export function planExpiry(activatedAt: number): number {
  return activatedAt + VALID_DAYS * DAY;
}
export function planGraceEnd(expiresAt: number): number {
  return expiresAt + GRACE_DAYS * DAY;
}
export function planForfeitWindowEnd(at: number): number {
  return at + FORFEIT_WINDOW_DAYS * DAY;
}
export function claimAppealEnd(decidedAt: number): number {
  return decidedAt + CLAIM_APPEAL_DAYS * DAY;
}

// 合法状态迁移表（用于服务端守卫，客户端不可跳状态）。
const transitions: Record<PlanStatus, PlanStatus[]> = {
  draft: ["awaiting_partner"],
  awaiting_partner: ["active", "cancelled"],
  active: ["cancelled", "claim_review", "forfeit_pending", "forfeited", "exception_review"],
  claim_review: ["active", "approved", "exception_review"],
  approved: ["redeemable", "exception_review"],
  redeemable: ["settled", "exception_review"],
  forfeit_pending: ["forfeited", "exception_review"],
  exception_review: ["cancelled", "forfeited", "claim_review"],
  settled: [], cancelled: [], forfeited: [], // 终态不可再支付
};

export function canTransition(from: PlanStatus, to: PlanStatus): boolean {
  return transitions[from].includes(to);
}

export const planTerminal: PlanStatus[] = ["settled", "cancelled", "forfeited"];

export function rewardBudgetFor(choice: RewardChoice): { kind: "points" | "rose_ticket"; amount: number } {
  return choice === "A" ? { kind: "points", amount: REWARD_POINTS_BUDGET } : { kind: "rose_ticket", amount: 1 };
}

// 冷静期内：可取消退款；之后只能走普通结束（失效异议期）或例外。
export function inCooling(plan: CommitmentPlan, now: number): boolean {
  return plan.status === "active" && plan.coolingUntil !== null && now < plan.coolingUntil;
}

// 目标必须发生在 [冷静期结束, 到期] 区间内；激活前已达成不计。
export function targetWindowValid(plan: CommitmentPlan, occurredAt: number): boolean {
  if (!plan.coolingUntil || !plan.expiresAt) return false;
  return occurredAt >= plan.coolingUntil && occurredAt <= plan.expiresAt;
}

export const planRulesSummary = [
  `双方各投入 ${INVEST_PER_USER} 演示点（初始 ${INITIAL_DEMO_BALANCE} 点，系统发放，不可购买/转让/提现）`,
  `激活后 ${COOLING_HOURS} 小时为冷静期，任一方取消即全额退回双方投入`,
  `有效期 ${VALID_DAYS} 天，到期后 ${GRACE_DAYS} 天宽限期只受理到期前已发生的目标`,
  `达成并通过核验：每人返还 ${INVEST_PER_USER} 点；奖励 A 各 ${REWARD_POINTS_EACH} 点，或奖励 B 共领一张 99 朵玫瑰演示券`,
  `普通结束或到期失效：投入记入不可流通的演示失效账户，不转给任何人；${FORFEIT_WINDOW_DAYS} 天异议窗口内可申请例外复核`,
  "退出关系不需要等待计划结算或对方同意",
];
