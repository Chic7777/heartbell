import type { DemoState, Profile, UserId } from "../types";

// Server-only mock store: single process, resets on restart; no production persistence.
const profiles: Record<UserId, Profile> = {
  a: { nickname: "小铃", avatar: "☕", interests: ["咖啡", "音乐"], bio: "想认识一个愿意一起散步的人。" },
  b: { nickname: "阿响", avatar: "🌷", interests: ["猫咪", "音乐"], bio: "慢热，但很期待新的相遇。" },
};
const globals = globalThis as typeof globalThis & { heartbellState?: DemoState };
export function getState(): DemoState {
  globals.heartbellState ??= { users: {
    a: { id: "a", radar: { active: false, zone: "wuhan-demo", traits: [{ category: "穿着", value: "黑色外套" }, { category: "手持物", value: "拿着咖啡" }], expiresAt: null } },
    b: { id: "b", radar: { active: false, zone: "wuhan-demo", traits: [{ category: "穿着", value: "白色上衣" }, { category: "配饰", value: "戴眼镜" }], expiresAt: null } },
  }, bells: [], eligibility: { a: false, b: false }, memory: null };
  const state = globals.heartbellState;
  for (const user of Object.values(state.users)) {
    if (user.radar.expiresAt && user.radar.expiresAt <= Date.now()) user.radar.active = false;
  }
  for (const bell of state.bells) {
    if (bell.status === "pending" && Date.now() - bell.createdAt >= 600_000) bell.status = "expired";
  }
  return state;
}
export function isUserId(value: unknown): value is UserId { return value === "a" || value === "b"; }
export function getRevealedProfile(viewer: UserId, target: UserId): Profile | null {
  const allowed = viewer === target || getState().bells.some(b => b.status === "accepted" &&
    ((b.from === viewer && b.to === target) || (b.to === viewer && b.from === target)));
  return allowed ? profiles[target] : null;
}
