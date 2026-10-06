import type { ButtonHTMLAttributes, ReactNode } from "react";

export function Button(props: ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button {...props} className={`button ${props.className ?? ""}`} />;
}
export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return <section className={`card ${className ?? ""}`}>{children}</section>;
}
export function PhoneFrame({ children }: { children: ReactNode }) {
  return <main className="phone"><div className="notch" />{children}</main>;
}
export function Chip({ tone, children }: { tone?: "brand" | "success" | "warning" | "danger" | "outline"; children: ReactNode }) {
  return <span className={`chip ${tone ?? ""}`}>{children}</span>;
}
export function EmptyState({ title, hint, action, compact }: { title: string; hint?: string; action?: ReactNode; compact?: boolean }) {
  return <div className={compact ? "empty-state compact" : "empty-state"}>{title}{hint && <span>{hint}</span>}{action && <div style={{ marginTop: 14 }}>{action}</div>}</div>;
}
export function ErrorBanner({ message, onDismiss }: { message: string; onDismiss: () => void }) {
  return <div role="alert" className="error-banner"><span>{message}</span><button className="text-button" onClick={onDismiss}>收起</button></div>;
}

// 统一线性图标（计划书 7.1：不用尺寸不一的 emoji 充当整套图标）
export function BellIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9a6 6 0 0 1 12 0c0 5 2 6 2 6H4s2-1 2-6" /><path d="M10 20a2.2 2.2 0 0 0 4 0" /><path d="M12 3v-1" /></svg>;
}
export function ChatIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 12a8 8 0 0 1-8 8H4l2-3a8 8 0 1 1 15-5z" /><path d="M9 11h6M9 14h4" /></svg>;
}
export function BookIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5a2 2 0 0 1 2-2h14v18H6a2 2 0 0 0-2 2z" /><path d="M4 19a2 2 0 0 1 2-2h14" /><path d="M9 7h6" /></svg>;
}
export function GiftIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="9" width="17" height="12" rx="2" /><path d="M3.5 13h17M12 9v12" /><path d="M12 9C9 9 7 7.8 7 6a2 2 0 0 1 4-1c.6 1.4 1 4 1 4zM12 9c3 0 5-1.2 5-3a2 2 0 0 0-4-1c-.6 1.4-1 4-1 4z" /></svg>;
}
export function RoseIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="4.5" /><path d="M12 12.5V21M12 17c-2.5 0-4.5-1.5-5-3.5M12 19c2.5 0 4.5-1.5 5-3.5" /></svg>;
}
export function RingIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="14" r="6" /><circle cx="12" cy="14" r="2.5" /><path d="M9 8l3-5 3 5" /></svg>;
}

// 三维度状态（计划书 7.5）：业务 / 存证 / 来源 分开呈现，不用一个对勾包办。
export function anchorStatusChip(status: string | undefined): { tone: "brand" | "success" | "warning" | "danger" | "outline"; label: string } {
  switch (status) {
    case "confirmed": return { tone: "success", label: "链上已核验" };
    case "submitted": case "queued": return { tone: "warning", label: "已提交待确认" };
    case "failed": case "reorged": return { tone: "danger", label: "写入失败" };
    case "unconfigured": return { tone: "outline", label: "预览 · 本地指纹" };
    default: return { tone: "outline", label: "未存证" };
  }
}
export function zhDate(ts: number | null | undefined): string {
  if (!ts) return "—";
  return new Date(ts).toLocaleDateString("zh-CN", { year: "numeric", month: "long", day: "numeric" });
}
export function countdownText(msLeft: number): string {
  if (msLeft <= 0) return "已到期";
  const minutes = Math.floor(msLeft / 60_000);
  if (minutes < 60) return `剩余 ${minutes} 分钟`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `剩余 ${Math.floor(hours / 24)} 天 ${hours % 24} 小时`;
  return `剩余 ${Math.floor(hours / 24)} 天`;
}
