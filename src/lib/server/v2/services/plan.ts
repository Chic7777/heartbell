// 相守计划服务（计划书第 6 节）：演示点数账本、冷静期、审核、领取、失效与例外复核。
import type { V2State } from "../../../repositories/demo-repo";
import { balanceOf, postLedger } from "../../../repositories/demo-repo";
import { badRequest, conflict, forbidden, notFound, versionConflict } from "../errors";
import {
  DAY, GRACE_DAYS, HOUR, INVEST_PER_USER, PLAN_INVITE_HOURS, PLAN_TERMS_VERSION,
  REWARD_POINTS_EACH, claimAppealEnd, planCoolingEnd, planExpiry, planGraceEnd,
  planInviteExpiry, planForfeitWindowEnd, rewardBudgetFor, targetWindowValid,
  REVIEW_LIMIT_DAYS, SUPPLEMENT_LIMIT_DAYS,
} from "../../../domain/plan-rules";
import { consumeReservation, planMembers, refundPrincipals, releaseReservation, settleForfeit } from "../registry";
import { enqueueAnchor } from "./anchor";
import { activeRelationshipOf } from "../../../repositories/demo-repo";
import type { CommitmentPlan, GoalClaim, RewardChoice } from "../../../domain/v2-types";

const activePlanStatuses = ["awaiting_partner", "active", "claim_review", "approved", "redeemable", "forfeit_pending", "exception_review"];

function findPlan(state: V2State, viewer: string, planId: unknown): { plan: CommitmentPlan; members: string[] } {
  if (typeof planId !== "string") throw badRequest("无效计划 ID");
  const plan = state.plans.find(p => p.id === planId);
  if (!plan) throw notFound("计划不存在");
  const rel = state.relationships.find(r => r.id === plan.relationshipId);
  if (!rel || !rel.members.includes(viewer)) throw forbidden("只有计划参与者可以操作");
  return { plan, members: [...rel.members] };
}

export function createPlan(state: V2State, viewer: string, input: Record<string, unknown>, now: number): string {
  const rel = activeRelationshipOf(state, viewer);
  if (!rel) throw forbidden("相守计划需要双方有效绑定后才能加入");
  if (state.plans.some(p => p.relationshipId === rel.id && activePlanStatuses.includes(p.status))) {
    throw conflict("PLAN_EXISTS", "这段关系已有一个进行中的相守计划");
  }
  const targetType = input.targetType === "anniversary" ? "anniversary" : "marriage";
  const rewardChoice: RewardChoice = input.rewardChoice === "B" ? "B" : "A";
  // 奖励 B 的玫瑰演示券为双方共同持有（每人各一张），不再指定单独领取人。
  const beneficiary: string | null = null;
  const plan: CommitmentPlan = {
    id: `plan-${Math.random().toString(36).slice(2, 10)}`,
    relationshipId: rel.id, status: "awaiting_partner",
    targetType, investPerUser: INVEST_PER_USER, rewardChoice, beneficiary,
    termsVersion: PLAN_TERMS_VERSION, proposedBy: viewer, partnerConsent: false,
    invitedAt: now, inviteExpiresAt: planInviteExpiry(now),
    activatedAt: null, coolingUntil: null, expiresAt: null, graceUntil: null,
    revision: 1, reservationId: null, forfeitWindowUntil: null, endedReason: null, anchor: null,
  };
  state.plans.push(plan);
  return plan.id;
}

// 激活：双方同意 + 双方余额充足 + 奖励预留成功，全部检查通过后才扣点（无半激活状态）。
export function acceptPlan(state: V2State, viewer: string, input: Record<string, unknown>, now: number): void {
  const { plan, members } = findPlan(state, viewer, input.planId);
  if (input.expectedRevision !== plan.revision) throw versionConflict("计划状态已更新，请重新确认。");
  if (input.termsConfirmed !== true) throw badRequest("需要确认条款后才能加入");
  if (plan.status !== "awaiting_partner") throw conflict("PLAN_STATE", "计划当前不可加入");
  if (plan.proposedBy === viewer) throw badRequest("发起人等待对方确认即可");
  const rel = state.relationships.find(r => r.id === plan.relationshipId)!;
  if (!["active", "married"].includes(rel.status)) throw conflict("RELATIONSHIP_ENDED", "关系已结束，无法激活新计划");
  for (const uid of members) {
    if (!state.users.get(uid)?.adultDeclared) throw forbidden("双方都需要完成成年演示声明");
    if (balanceOf(state, `user:${uid}`, "demo-point") < plan.investPerUser) {
      throw conflict("INSUFFICIENT_BALANCE", `演示点数余额不足（需要 ${plan.investPerUser} 点）`);
    }
  }
  const budget = rewardBudgetFor(plan.rewardChoice);
  const poolAvailable = balanceOf(state, "pool:reward", budget.kind === "points" ? "demo-point" : "rose-ticket");
  if (poolAvailable < budget.amount) {
    throw conflict("REWARD_UNAVAILABLE", "奖励预算不足，计划无法激活（双方均不会被扣点）");
  }
  // ---- 全部检查通过，以下为一次性变更 ----
  const reservation = {
    id: `reserve-${Math.random().toString(36).slice(2, 10)}`,
    planId: plan.id, kind: budget.kind, amount: budget.amount,
    status: "reserved" as const, createdAt: now,
  };
  state.reservations.push(reservation);
  plan.reservationId = reservation.id;
  for (const uid of members) {
    postLedger(state, {
      from: `user:${uid}`, to: `plan:${plan.id}`, amount: plan.investPerUser, unit: "demo-point",
      businessKey: `invest:${plan.id}:${uid}`, type: "invest", note: "相守计划投入（演示点数）",
    }, now);
  }
  plan.partnerConsent = true;
  plan.status = "active";
  plan.activatedAt = now;
  plan.coolingUntil = planCoolingEnd(now);
  plan.expiresAt = planExpiry(now);
  plan.graceUntil = planGraceEnd(plan.expiresAt);
  const job = enqueueAnchor(state, "plan_terms", plan.id, 1, {
    recordType: "plan_terms", recordId: plan.id, version: 1,
    relationshipId: plan.relationshipId,
    businessOccurredAt: new Date(now).toISOString(),
    previousVersionCommitment: null,
    participants: members,
    content: { targetType: plan.targetType, rewardChoice: plan.rewardChoice, investPerUser: plan.investPerUser, termsVersion: plan.termsVersion },
    attachmentHashes: [], rulesVersion: PLAN_TERMS_VERSION,
  }, now);
  plan.anchor = {
    jobId: job.id, commitment: job.commitment, chainStatus: job.status,
    txHash: job.txHash, blockNumber: job.blockNumber,
    networkLabel: job.chainMode === "preview" ? "preview（未连接真实链）" : job.chainMode,
    error: job.error, createdAt: job.createdAt, updatedAt: job.updatedAt,
  };
}

// 取消/结束：冷静期退款；普通结束进入 7 天异议窗口；例外进入复核。均不替代关系结束。
export function cancelPlan(state: V2State, viewer: string, input: Record<string, unknown>, now: number): void {
  const { plan, members } = findPlan(state, viewer, input.planId);
  if (input.expectedRevision !== plan.revision) throw versionConflict("计划状态已更新，请重新确认。");
  const reasonType = String(input.reasonType ?? "");
  if (plan.status === "awaiting_partner") {
    plan.status = "cancelled";
    plan.revision += 1;
    return;
  }
  if (reasonType === "exception") {
    if (["settled", "cancelled", "forfeited"].includes(plan.status)) throw conflict("PLAN_STATE", "计划已结束");
    plan.status = "exception_review";
    plan.revision += 1;
    state.disputes.push({
      id: `dispute-${Math.random().toString(36).slice(2, 10)}`,
      targetType: "plan", targetId: plan.id, raisedBy: viewer,
      note: typeof input.note === "string" ? input.note.slice(0, 120) : "申请例外处理",
      createdAt: now, resolvedAt: null, resolution: null,
    });
    return;
  }
  if (plan.status !== "active") throw conflict("PLAN_STATE", "计划当前状态不支持该操作");
  if (plan.coolingUntil !== null && now < plan.coolingUntil) {
    // 冷静期内取消：原路退回双方投入，不给奖励。
    plan.status = "cancelled";
    plan.endedReason = "cooling_cancel";
    refundPrincipals(state, plan, now, "cooling");
    plan.revision += 1;
    return;
  }
  const inFlight = state.claims.some(c => c.planId === plan.id && ["submitted", "need_more", "approved"].includes(c.status));
  if (inFlight) throw conflict("CLAIM_PENDING", "已有在途的达成申请，请等待核验或走例外复核");
  // 冷静期后普通结束：进入 7 天异议窗口。
  plan.status = "forfeit_pending";
  plan.endedReason = "normal_end";
  plan.forfeitWindowUntil = planForfeitWindowEnd(now);
  plan.revision += 1;
  void members;
}

// 达成申请：目标必须发生在 [冷静期结束, 到期]；到期宽限期内仍可提交到期前已发生的目标。
export function submitClaim(state: V2State, viewer: string, input: Record<string, unknown>, now: number): void {
  const { plan, members } = findPlan(state, viewer, input.planId);
  if (!["active", "claim_review"].includes(plan.status)) {
    if (plan.status === "forfeit_pending") {
      // 异议窗口内仍可受理有证据的“结束前已达成”申请。
    } else {
      throw conflict("PLAN_STATE", "计划当前状态不可提交达成申请");
    }
  }
  const existing = state.claims.find(c => c.planId === plan.id && ["submitted", "need_more", "approved"].includes(c.status));
  if (existing) throw conflict("CLAIM_PENDING", "该计划已有在途申请");
  const occurredAt = typeof input.targetOccurredAt === "number" ? input.targetOccurredAt : Date.parse(String(input.targetOccurredAt));
  if (!Number.isFinite(occurredAt)) throw badRequest("请选择目标发生时间");
  if (!plan.activatedAt || !plan.coolingUntil || !plan.expiresAt) throw conflict("PLAN_STATE", "计划尚未激活");
  if (!targetWindowValid(plan, occurredAt)) throw badRequest("目标必须发生在冷静期结束后、计划到期前（激活前已达成不计）");
  if (plan.graceUntil !== null && now > plan.graceUntil) throw badRequest("已超过到期宽限期，不能再提交申请");
  const evidenceNote = typeof input.evidenceNote === "string" && input.evidenceNote.trim() ? input.evidenceNote.trim().slice(0, 200) : null;
  if (!evidenceNote) throw badRequest("请说明演示材料（P0 全部为演示材料，醒目标注非真实证件）");
  const claim: GoalClaim = {
    id: `claim-${Math.random().toString(36).slice(2, 10)}`,
    planId: plan.id, submittedBy: viewer, targetOccurredAt: occurredAt,
    evidenceNote, isDemoMaterial: true, status: "submitted",
    submittedAt: now, decidedAt: null, decidedBy: null, decisionNote: null,
    appealUntil: null, dedupeToken: `claim:${plan.id}`,
    reviewDeadlineAt: now + REVIEW_LIMIT_DAYS * DAY,
  };
  state.claims.push(claim);
  plan.status = "claim_review";
  void members; void SUPPLEMENT_LIMIT_DAYS;
}

// 审核决定：仅演示台（APP_MODE=demo），模拟“通过 / 补充材料 / 不通过”。
export function decideClaim(state: V2State, claimId: unknown, input: Record<string, unknown>, now: number): void {
  if (typeof claimId !== "string") throw badRequest("无效申请 ID");
  const claim = state.claims.find(c => c.id === claimId);
  if (!claim) throw notFound("申请不存在");
  if (!["submitted", "need_more"].includes(claim.status)) throw conflict("CLAIM_STATE", "该申请已处理");
  const decision = String(input.decision ?? "");
  const note = typeof input.note === "string" && input.note.trim() ? input.note.trim().slice(0, 200) : null;
  const plan = state.plans.find(p => p.id === claim.planId)!;
  claim.decidedAt = now;
  claim.decidedBy = "demo-admin";
  claim.decisionNote = note;
  if (decision === "approve") {
    claim.status = "approved";
    claim.appealUntil = claimAppealEnd(now);
    if (["claim_review", "exception_review"].includes(plan.status)) plan.status = "approved";
    // 婚姻目标通过审核：只有仍为 active 的关系可更新为 married；已结束的保持结束。
    if (plan.targetType === "marriage") {
      const rel = state.relationships.find(r => r.id === plan.relationshipId)!;
      if (rel.status === "active") { rel.status = "married"; rel.marriedAt = now; }
    }
    enqueueAnchor(state, "claim_result", claim.id, 1, {
      recordType: "claim_result", recordId: claim.id, version: 1,
      relationshipId: plan.relationshipId,
      businessOccurredAt: new Date(now).toISOString(),
      previousVersionCommitment: plan.anchor?.commitment ?? null,
      participants: planMembers(state, plan),
      content: { planId: plan.id, decision: "approved", targetOccurredAt: new Date(claim.targetOccurredAt).toISOString(), isDemoMaterial: true },
      attachmentHashes: [], rulesVersion: PLAN_TERMS_VERSION,
    }, now);
  } else if (decision === "need_more") {
    claim.status = "need_more";
    claim.reviewDeadlineAt = now + SUPPLEMENT_LIMIT_DAYS * DAY;
    claim.decidedAt = null; // 补正后重新进入待审
  } else if (decision === "reject") {
    claim.status = "rejected";
    if (plan.status === "claim_review") plan.status = "active"; // 尚在有效期则回到进行中；否则 sweep 按到期处理
  } else {
    throw badRequest("无效审核决定");
  }
}

// 领取：仅受益人；一次性幂等，重复点击/并发/重试都只结算一次。
export function redeemBenefit(state: V2State, viewer: string, benefitId: unknown, input: Record<string, unknown>, now: number): void {
  if (typeof benefitId !== "string") throw badRequest("无效权益 ID");
  const benefit = state.benefits.find(b => b.id === benefitId);
  if (!benefit) throw notFound("权益不存在");
  if (!benefit.recipients.includes(viewer)) throw forbidden("只有权益领取人可以领取");
  if (benefit.status === "settled") return; // 幂等：重复领取返回原结果
  const plan = state.plans.find(p => p.id === benefit.planId)!;
  if (plan.status !== "redeemable") throw conflict("PLAN_STATE", "计划当前不可领取");
  // ---- 原子结算 ----
  refundPrincipals(state, plan, now, "settle");
  if (benefit.kind === "points_each") {
    for (const uid of planMembers(state, plan)) {
      postLedger(state, {
        from: "pool:reward", to: `user:${uid}`, amount: REWARD_POINTS_EACH, unit: "demo-point",
        businessKey: `reward:${plan.id}:${uid}`, type: "reward", note: "相守计划达成奖励（独立奖励预算）",
      }, now);
    }
  } else {
    // 玫瑰演示券双方共同持有：每人各得一张（预留库存 2 张）。
    for (const uid of planMembers(state, plan)) {
      postLedger(state, {
        from: "pool:reward", to: `user:${uid}`, amount: 1, unit: "rose-ticket",
        businessKey: `rose:${plan.id}:${uid}`, type: "redeem", note: "99 朵玫瑰演示券 · 双方共同持有（不可实际核销）",
      }, now);
    }
  }
  consumeReservation(state, plan);
  benefit.status = "settled";
  benefit.redeemedAt = now;
  plan.status = "settled";
  enqueueAnchor(state, "settlement", plan.id, 1, {
    recordType: "settlement", recordId: plan.id, version: 1,
    relationshipId: plan.relationshipId,
    businessOccurredAt: new Date(now).toISOString(),
    previousVersionCommitment: plan.anchor?.commitment ?? null,
    participants: planMembers(state, plan),
    content: { planId: plan.id, kind: benefit.kind, rewardChoice: plan.rewardChoice },
    attachmentHashes: [], rulesVersion: PLAN_TERMS_VERSION,
  }, now);
}

// 申诉：普通失效等待期或审核争议 → 冻结结算进入例外复核，不冻结退出权。
export function raiseDispute(state: V2State, viewer: string, input: Record<string, unknown>, now: number): void {
  const targetType = String(input.targetType ?? "");
  const targetId = typeof input.targetId === "string" ? input.targetId : null;
  const note = typeof input.note === "string" && input.note.trim() ? input.note.trim().slice(0, 200) : null;
  if (!targetId) throw badRequest("无效申诉目标");
  if (targetType === "plan") {
    const { plan } = findPlan(state, viewer, targetId);
    if (!["forfeit_pending", "approved", "redeemable", "claim_review"].includes(plan.status)) {
      throw conflict("PLAN_STATE", "该计划当前没有可申诉的结算");
    }
    plan.status = "exception_review";
  } else if (targetType === "trust") {
    const promise = state.promises.find(p => p.id === targetId);
    if (!promise) throw notFound("承诺不存在");
    memberCheck(state, viewer, promise.relationshipId);
  } else {
    throw badRequest("无效申诉类型");
  }
  state.disputes.push({
    id: `dispute-${Math.random().toString(36).slice(2, 10)}`,
    targetType: targetType as "plan" | "trust", targetId, raisedBy: viewer,
    note: note ?? "", createdAt: now, resolvedAt: null, resolution: null,
  });
}

function memberCheck(state: V2State, viewer: string, relationshipId: string): void {
  const rel = state.relationships.find(r => r.id === relationshipId);
  if (!rel || !rel.members.includes(viewer)) throw forbidden("只有关系成员可以申诉");
}

// 演示台：例外复核结论 —— 取消退款 或 维持失效 或 返回核验。
export function resolveException(state: V2State, planId: unknown, decision: string, now: number): void {
  const plan = state.plans.find(p => p.id === planId);
  if (!plan) throw notFound("计划不存在");
  if (plan.status !== "exception_review") throw conflict("PLAN_STATE", "该计划不在例外复核中");
  if (decision === "refund") {
    plan.status = "cancelled";
    plan.endedReason = "exception";
    refundPrincipals(state, plan, now, "exception");
  } else if (decision === "forfeit") {
    plan.status = "forfeited";
    plan.endedReason = plan.endedReason ?? "normal_end";
    settleForfeit(state, plan, now);
  } else if (decision === "back_to_review") {
    plan.status = "claim_review";
  } else {
    throw badRequest("无效复核结论");
  }
  const dispute = state.disputes.find(d => d.targetId === plan.id && !d.resolvedAt);
  if (dispute) { dispute.resolvedAt = now; dispute.resolution = decision; }
}

export { findPlan };
