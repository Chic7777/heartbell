// 关系状态机（计划书 2.3 节）。
import type { RelationshipStatus, V2Relationship } from "./v2-types";

export const RELATIONSHIP_TERMS_VERSION = "relationship-terms-v1";
export const RELATIONSHIP_INVITE_HOURS = 72;

export const HOUR = 3_600_000;

// 合法状态迁移：proposed 可取消/拒绝/过期；active→ended 或 active→married；married 仍可解除绑定。
const transitions: Record<RelationshipStatus, RelationshipStatus[]> = {
  proposed: ["active", "declined", "cancelled", "expired"],
  active: ["ended", "married"],
  married: ["ended"],
  ended: [], declined: [], cancelled: [], expired: [],
};

export function canTransition(from: RelationshipStatus, to: RelationshipStatus): boolean {
  return transitions[from].includes(to);
}

export function isActiveBinding(rel: V2Relationship | null | undefined): boolean {
  return !!rel && (rel.status === "active" || rel.status === "married");
}

export function inviteExpired(rel: V2Relationship, now: number): boolean {
  return rel.status === "proposed" && now > rel.inviteExpiresAt;
}
