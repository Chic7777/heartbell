export type UserId = "a" | "b";
export type BellStatus = "pending" | "accepted" | "dismissed" | "expired";
export type TraitCategory = "穿着" | "配饰" | "手持物" | "当前状态" | "其他";
export interface Trait { category: TraitCategory; value: string; }
export interface Profile { nickname: string; avatar: string; interests: string[]; bio: string; }
export interface RadarSession { active: boolean; zone: string; traits: Trait[]; expiresAt: number | null; }
export interface PublicUser { id: UserId; radar: RadarSession; }
export interface Bell { id: string; from: UserId; to: UserId; message: string; status: BellStatus; createdAt: number; }
export interface MutualConsent { a: boolean; b: boolean; }
// 情侣日记：由一方写下、双方确认后可上链存证的节点记录。
export type DiaryKind = "first-echo" | "anniversary" | "trip" | "ordinary-day" | "promise";
export type DiaryStatus = "awaiting-consent" | "ready" | "rejected";
export interface DiaryChainTx { by: UserId; hash: string; }
export interface DiaryChain { txs: DiaryChainTx[]; confirmedAt: number | null; }
export interface Diary {
  id: string;
  kind: DiaryKind;
  date: string;
  title: string;
  message: string;
  author: UserId;
  createdAt: number;
  contentHash: string;
  status: DiaryStatus;
  consent: MutualConsent;
  chain: DiaryChain | null;
}
export interface DemoState { users: Record<UserId, PublicUser>; bells: Bell[]; eligibility: Record<UserId, boolean>; diaries: Diary[]; wallets: Record<UserId, string | null>; }
export interface ApiResult<T> { data: T; mode: "mock"; }
