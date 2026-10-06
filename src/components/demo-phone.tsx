"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button, Card, PhoneFrame } from "./ui";
import { Modal } from "./modal";
import { WalletPanel } from "./wallet-panel";
import { DiaryTab } from "./diary-tab";
import type { Bell, Diary, Profile, PublicUser, Trait, TraitCategory, UserId } from "../lib/types";
interface View { self: PublicUser; nearby: PublicUser[]; bells: Bell[]; profile: Profile | null; eligibility: { declared: boolean }; diaries: Diary[]; wallets: Record<UserId, string | null>; }
type Tab = "radar" | "echoes" | "memories";
const categories: TraitCategory[] = ["穿着", "配饰", "手持物", "当前状态", "其他"];
const phrases = ["想认识你。", "想和你聊一聊。", "想一起喝杯咖啡。"];
export function DemoPhone({ user }: { user: UserId }) {
  const [view, setView] = useState<View | null>(null);
  const [traits, setTraits] = useState<Trait[]>(user === "a" ? [{ category: "穿着", value: "黑色外套" }, { category: "手持物", value: "拿着咖啡" }] : [{ category: "穿着", value: "白色上衣" }, { category: "配饰", value: "戴眼镜" }]);
  const [single, setSingle] = useState(false);
  const [tab, setTab] = useState<Tab>("radar");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [walletOpen, setWalletOpen] = useState(false);
  const [walletAccount, setWalletAccount] = useState<string | null>(null);
  const [selected, setSelected] = useState(false);
  const [message, setMessage] = useState(phrases[0]);
  const [postponed, setPostponed] = useState<string[]>([]);
  const seenReveal = useRef(false);
  const scroll = useRef<HTMLDivElement>(null);
  const refresh = useCallback(async () => {
    const response = await fetch(`/api/demo?viewer=${user}`, { cache: "no-store" });
    if (!response.ok) throw new Error("无法连接演示服务");
    setView((await response.json()).data);
  }, [user]);
  useEffect(() => { const poll = () => refresh().catch(() => setError("连接暂时中断，请检查服务。")); poll(); const timer = setInterval(poll, 1200); return () => clearInterval(timer); }, [refresh]);
  useEffect(() => { if (view?.self.radar.active) setTraits(view.self.radar.traits); }, [view?.self.radar.active, view?.self.radar.traits]);
  useEffect(() => { if (view?.profile && !seenReveal.current) { seenReveal.current = true; setSelected(false); setTab("echoes"); } }, [view?.profile]);
  useEffect(() => { scroll.current?.scrollTo({ top: 0 }); }, [tab, view?.self.radar.active]);
  async function act(payload: Record<string, unknown>): Promise<boolean> {
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/demo", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ viewer: user, ...payload }) });
      const result = await response.json(); if (!response.ok) throw new Error(result.error);
      await refresh(); return true;
    } catch (e) { setError(e instanceof Error ? e.message : "操作失败"); return false; } finally { setBusy(false); }
  }
  async function startRadar() {
    if (!view?.eligibility.declared && !await act({ action: "declare", single: true })) return;
    await act({ action: "radar", active: true, traits: traits.map(t => ({ ...t, value: t.value.trim() })) });
  }
  const pending = view?.bells.filter(b => b.to === user && b.status === "pending") ?? [];
  const incoming = pending.find(b => !postponed.includes(b.id));
  const sent = view?.bells.filter(b => b.from === user) ?? [];
  const target = view?.nearby[0];
  const alreadySent = sent.some(b => target?.radar.expiresAt && b.createdAt >= target.radar.expiresAt - 600_000);
  const waiting = sent.some(b => b.status === "pending");
  const diaryWaiting = view?.diaries.some(d => d.status === "awaiting-consent" && !d.consent[user]) ?? false;
  function postpone() { if (incoming) setPostponed([...postponed, incoming.id]); }
  function openWallet() { setWalletOpen(true); }
  return <PhoneFrame>
    <header className="app-header"><div><span className="brand">♡ 心动铃铛</span><small className="user-label">用户 {user.toUpperCase()} · 演示模式</small></div><WalletPanel open={walletOpen} onOpenChange={setWalletOpen} onAccountChange={setWalletAccount} /></header>
    <div className="phone-scroll" ref={scroll}>
      {error && <p role="alert" className="error">{error}<button className="text-button" onClick={() => setError("")}>收起</button></p>}
      {!view ? <div className="empty-state">正在连接演示服务……</div> : <>
        {tab === "radar" && (!view.self.radar.active ? <>
          <p className="eyebrow">一次小小的勇敢</p><h1>此刻的你，<br />是什么模样？</h1><p className="muted">留下两三个短暂特征，让心动的人认出你。</p>
          <Card><div className="traits">{traits.map((trait, i) => <div className="trait-row" key={i}><select aria-label={`特征 ${i + 1} 类别`} value={trait.category} onChange={e => setTraits(traits.map((t, j) => j === i ? { ...t, category: e.target.value as TraitCategory } : t))}>{categories.map(category => <option key={category}>{category}</option>)}</select><input aria-label={`特征 ${i + 1} 内容`} placeholder="自己写此刻的特征" maxLength={20} value={trait.value} onChange={e => setTraits(traits.map((t, j) => j === i ? { ...t, value: e.target.value } : t))} /></div>)}</div>
          <button className="text-button" onClick={() => setTraits(traits.length === 2 ? [...traits, { category: "其他", value: "" }] : traits.slice(0, 2))}>{traits.length === 2 ? "+ 添加一项" : "移除第三项"}</button>
          <p className="trait-preview">别人将看到<br /><span>{traits.filter(t => t.value.trim()).map(t => t.value).join(" · ") || "你的临时特征"}</span></p>
          {!view.eligibility.declared && <label className="checkbox"><input type="checkbox" checked={single} onChange={e => setSingle(e.target.checked)} />我目前单身，愿意认识新的人。</label>}
          <Button disabled={busy || traits.some(t => !t.value.trim()) || (!view.eligibility.declared && !single)} onClick={startRadar}>{busy ? "准备中…" : "开启 10 分钟心动雷达"}</Button>
          <p className="muted center">开启才会被发现，随时可以关闭。</p></Card>
        </> : <>
          <div className="section-title page-title"><div><p className="eyebrow">或许，心动就在附近</p><h1>心动雷达</h1></div><button className="text-button" disabled={busy} onClick={() => act({ action: "radar", active: false, traits: view.self.radar.traits })}>关闭</button></div>
          <p className="muted">武汉街头 · 模拟位置 · 本轮最长 10 分钟</p>
          <div className="radar"><div className="radar-core">🔔</div>{target && <span className="radar-dot">♡</span>}</div>
          {target ? <Card><span className="badge">发现一枚铃铛</span><h3>{target.radar.traits.map(t => t.value).join(" · ")}</h3><p className="muted">是你刚刚注意到的人吗？</p><Button disabled={busy || alreadySent} onClick={() => setSelected(true)}>{alreadySent ? waiting ? "铃声已送出，等待回响" : "本轮已经摇过铃" : "向 TA 摇一下铃铛"}</Button></Card> : <div className="empty-state compact">还没有发现附近的铃铛<br /><span>让另一位演示用户也开启雷达吧。</span></div>}
        </>)}
        {tab === "echoes" && <><p className="eyebrow">每一次回应，都值得珍惜</p><h1>我的回响</h1>
          {view.profile ? <Card><div className="reveal-avatar">{view.profile.avatar}</div><h2 className="center">你们的心动，有了回响。</h2><h3 className="center">{view.profile.nickname}</h3><p className="center">{view.profile.interests.join(" · ")}</p><p className="muted center">{view.profile.bio}</p><Button onClick={() => setTab("memories")}>写下第一页日记</Button><p className="muted center">联系方式交换将在后续接入。</p></Card> : <>
            {pending.map(b => <Card key={b.id}><h2>🔔 有人想认识你</h2><p>{b.message}</p><Button onClick={() => setPostponed(postponed.filter(id => id !== b.id))}>听听这次心动</Button></Card>)}
            {sent.map(b => <Card key={b.id}><h2>你送出的铃声</h2><p>{b.message}</p><p className="pink">{b.status === "pending" ? "等待回响" : "铃声已消散"}</p></Card>)}
            {!pending.length && !sent.length && <div className="empty-state">还没有回响<br /><span>从轻轻摇一下铃铛开始。</span><Button onClick={() => setTab("radar")}>去看看附近</Button></div>}
          </>}
        </>}
        {tab === "memories" && <DiaryTab viewer={user} profile={view.profile} diaries={view.diaries} wallets={view.wallets} walletAccount={walletAccount} busy={busy} act={act} onOpenWallet={openWallet} onGoRadar={() => setTab("radar")} />}
      </>}
      <details className="demo-details"><summary>演示说明</summary><p>位置与用户身份为模拟。勾选单身声明仅启用演示资格，没有生成或验证真实 ZK 证明，不能认证现实单身。钱包可真实连接；情侣日记在合约部署并绑定双方钱包后可真实上链，未就绪时仅预览、不生成模拟交易哈希。雷达图标不代表方向或距离。</p><a href="/">返回演示入口</a></details>
    </div>
    <nav className="bottom-nav" aria-label="主要导航">{([{ id: "radar", icon: "◎", text: "心动雷达" }, { id: "echoes", icon: "♡", text: "我的回响" }, { id: "memories", icon: "📖", text: "情侣日记" }] as const).map(item => <button key={item.id} aria-current={tab === item.id ? "page" : undefined} className={tab === item.id ? "active" : ""} onClick={() => setTab(item.id)}><span>{item.icon}{item.id === "echoes" && pending.length > 0 && <i className="notification-dot" />}{item.id === "memories" && diaryWaiting && <i className="notification-dot" />}</span>{item.text}</button>)}</nav>
    {selected && target && !walletOpen && !incoming && <Modal title="轻轻摇一下" onClose={() => setSelected(false)}><p>{target.radar.traits.map(t => t.value).join(" · ")}</p><p className="muted">选择一句你想对 TA 说的话。</p><div className="phrase-options">{phrases.map(phrase => <button key={phrase} className={message === phrase ? "chosen" : ""} aria-pressed={message === phrase} onClick={() => setMessage(phrase)}>{phrase}</button>)}</div><Button disabled={busy} onClick={async () => { if (await act({ action: "ring", message })) setSelected(false); }}>送出这次心动</Button>{error && <p className="error" role="alert">{error}</p>}</Modal>}
    {incoming && !walletOpen && <Modal title="叮——有人想认识你" onClose={postpone}><div className="reveal-avatar">🔔</div><p className="quote center">“{incoming.message}”</p><p className="muted">回响后，双方才会看到昵称、头像和兴趣。</p><Button disabled={busy} onClick={() => act({ action: "respond", bellId: incoming.id, status: "accepted" })}>我也想认识 TA</Button><Button className="secondary" disabled={busy} onClick={() => act({ action: "respond", bellId: incoming.id, status: "dismissed" })}>让铃声消散</Button><button className="text-button" onClick={postpone}>稍后决定</button>{error && <p className="error" role="alert">{error}</p>}</Modal>}
  </PhoneFrame>;
}
