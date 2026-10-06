export type UserId = "a" | "b";
export type BellStatus = "pending" | "accepted" | "dismissed" | "expired";
export type MemoryStatus = "awaiting-consent" | "ready" | "simulated";
export type TraitCategory = "穿着" | "配饰" | "手持物" | "当前状态" | "其他";
export interface Trait { category: TraitCategory; value: string; }
export interface Profile { nickname: string; avatar: string; interests: string[]; bio: string; }
export interface RadarSession { active: boolean; zone: string; traits: Trait[]; expiresAt: number | null; }
export interface PublicUser { id: UserId; radar: RadarSession; }
export interface Bell { id: string; from: UserId; to: UserId; message: string; status: BellStatus; createdAt: number; }
export interface MutualConsent { a: boolean; b: boolean; }
export interface Memory { id: string; title: string; createdAt: number; contentHash: string; status: MemoryStatus; consent: MutualConsent; transactionHash: null; }
export interface DemoState { users: Record<UserId, PublicUser>; bells: Bell[]; eligibility: Record<UserId, boolean>; memory: Memory | null; }
export interface ApiResult<T> { data: T; mode: "mock"; }
