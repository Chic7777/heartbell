"use client";
import { useState } from "react";
import type { Address } from "viem";
import { Button, Card } from "./ui";
import { Modal } from "./modal";
import { approveDiaryOnChain } from "../lib/chain/memory";
import { botChain, memoryContractAddress } from "../lib/chain/config";
import type { Diary, DiaryKind, Profile, UserId } from "../lib/types";
const kinds: { id: DiaryKind; label: string; icon: string }[] = [
  { id: "first-echo", label: "第一次回响", icon: "🔔" },
  { id: "anniversary", label: "在一起的日子", icon: "🎂" },
  { id: "trip", label: "一起旅行", icon: "🧭" },
  { id: "ordinary-day", label: "平凡的一天", icon: "☁️" },
  { id: "promise", label: "一个约定", icon: "💞" },
];
const kindOf = (id: DiaryKind) => kinds.find(kind => kind.id === id) ?? kinds[0];
const explorerTx = (hash: string) => `${botChain.blockExplorers.default.url}/tx/${hash}`;
const zhDate = (date: string) => new Date(`${date}T00:00:00`).toLocaleDateString("zh-CN");
const today = () => new Date().toISOString().slice(0, 10);
interface Props {
  viewer: UserId;
  profile: Profile | null;
  diaries: Diary[];
  wallets: Record<UserId, string | null>;
  walletAccount: string | null;
  busy: boolean;
  act(payload: Record<string, unknown>): Promise<boolean>;
  onOpenWallet(): void;
  onGoRadar(): void;
}
export function DiaryTab({ viewer, profile, diaries, wallets, walletAccount, busy, act, onOpenWallet, onGoRadar }: Props) {
  const other: UserId = viewer === "a" ? "b" : "a";
  const [creating, setCreating] = useState(false);
  const [kind, setKind] = useState<DiaryKind>("first-echo");
  const [date, setDate] = useState(today());
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [chainBusy, setChainBusy] = useState(false);
  const [chainError, setChainError] = useState("");
  const [pendingReport, setPendingReport] = useState<{ diaryId: string; hash: string } | null>(null);
  const contractReady = memoryContractAddress() !== null;
  const sorted = [...diaries].sort((x, y) => y.date === x.date ? y.createdAt - x.createdAt : y.date < x.date ? -1 : 1);
  const open = diaries.find(d => d.id === openId) ?? null;
  const contractAddress = memoryContractAddress();
  const bindNeeded = !!walletAccount && wallets[viewer] !== walletAccount.toLowerCase();
  async function reportTx(diaryId: string, hash: string) {
    if (await act({ action: "diary-onchain", diaryId, txHash: hash })) setPendingReport(null);
    else setPendingReport({ diaryId, hash });
  }
  async function writeDiaryToChain(diary: Diary) {
    setChainBusy(true); setChainError("");
    try {
      const result = await approveDiaryOnChain(diary.contentHash as Address, wallets.a as Address, wallets.b as Address);
      await reportTx(diary.id, result.transactionHash);
    } catch (e) {
      setChainError(e instanceof Error ? e.message : "上链失败，请重试");
    } finally { setChainBusy(false); }
  }
  function closeDetail() { setOpenId(null); setChainError(""); setPendingReport(null); }
  return <>
    <p className="eyebrow">恋爱纪念碑</p><h1>情侣日记</h1>
    <p className="muted">把重要的节点写成一页日记。双方确认后写入 BOT Chain，链上只保存指纹，谁也改不了这一页。</p>
    {!profile ? <div className="empty-state">第一页日记，等待一次回响。<Button onClick={onGoRadar}>去遇见一枚铃铛</Button></div> : <>
      <button className="diary-new" onClick={() => { setCreating(true); setDate(today()); setKind("first-echo"); setTitle(""); setMessage(""); }}>＋ 写下新的一页</button>
      {sorted.length === 0 && <div className="empty-state compact">还没有日记<br /><span>第一次回响、在一起的日子、一次旅行……都值得留下。</span></div>}
      <div className="diary-list">
        {sorted.map(diary => {
          const confirmed = !!diary.chain?.confirmedAt;
          const mineWritten = diary.chain?.txs.some(tx => tx.by === viewer) ?? false;
          const needsMe = diary.status === "awaiting-consent" && !diary.consent[viewer];
          return <button className="diary-item" key={diary.id} onClick={() => setOpenId(diary.id)}>
            <span className="diary-icon">{kindOf(diary.kind).icon}</span>
            <span className="diary-main"><strong>{diary.title}</strong><small>{zhDate(diary.date)} · {kindOf(diary.kind).label}</small></span>
            <span className={confirmed ? "chip chip-chain" : needsMe ? "chip chip-hot" : "chip"}>{confirmed ? "已上链" : mineWritten ? "上链中" : diary.status === "rejected" ? "已婉拒" : diary.status === "ready" ? "待上链" : needsMe ? "待你确认" : "待确认"}</span>
          </button>;
        })}
      </div>
      <details className="demo-details"><summary>这一页会怎样上链</summary>
        <p>双方各自发起一笔确认交易，调用已部署的 HeartbellMemories 合约；链上保存内容指纹和双方批准记录，不保存日记原文。演示服务未连接链上节点，交易回报来自前端真实钱包回执。</p>
        {contractAddress && <p className="address">合约：{contractAddress}</p>}
      </details>
    </>}
    {creating && <Modal title="写下新的一页" onClose={() => setCreating(false)}>
      <p className="muted">选择节点类型，写下当时的话。提交后需要 TA 也确认这一页。</p>
      <div className="kind-options">{kinds.map(option => <button key={option.id} className={kind === option.id ? "chosen" : ""} aria-pressed={kind === option.id} onClick={() => setKind(option.id)}><span>{option.icon}</span>{option.label}</button>)}</div>
      <label className="field-label" htmlFor="diary-date">这一刻发生在</label>
      <input id="diary-date" type="date" value={date} max={today()} onChange={e => setDate(e.target.value)} />
      <label className="field-label" htmlFor="diary-title">标题</label>
      <input id="diary-title" placeholder="例如：第一次见面" maxLength={20} value={title} onChange={e => setTitle(e.target.value)} />
      <label className="field-label" htmlFor="diary-message">写一句想留下的话</label>
      <textarea id="diary-message" placeholder="当时的心情、地点，或一句只有你们懂的话。" maxLength={60} rows={3} value={message} onChange={e => setMessage(e.target.value)} />
      <div className="monument">
        <span className="badge">纪念碑预览</span>
        <div className="reveal-avatar">{kindOf(kind).icon}</div>
        <h3 className="center">{title.trim() || "这一页的标题"}</h3>
        <p className="center">{date ? zhDate(date) : ""}</p>
        <p className="center quote-sm">“{message.trim() || "想留下的话"}”</p>
      </div>
      <Button disabled={busy || !date || !title.trim() || !message.trim()} onClick={async () => { if (await act({ action: "diary-create", kind, date, title, message })) setCreating(false); }}>{busy ? "保存中…" : "送到 TA 面前"}</Button>
    </Modal>}
    {open && <Modal title={open.status === "rejected" ? "已婉拒的一页" : "这一页日记"} onClose={closeDetail}>
      <div className="monument monument-open">
        <span className="badge">{open.chain?.confirmedAt ? "已写入 BOT Chain" : "纪念碑预览"}</span>
        <div className="reveal-avatar">{kindOf(open.kind).icon}</div>
        <h3 className="center">{open.title}</h3>
        <p className="center">{zhDate(open.date)} · {kindOf(open.kind).label}</p>
        <p className="center quote-sm">“{open.message}”</p>
        <p className="muted center">{open.author === viewer ? "你写下的一页" : "TA 写下的一页"} · A {open.consent.a ? "已确认 ✓" : "等待确认"} · B {open.consent.b ? "已确认 ✓" : "等待确认"}</p>
      </div>
      {open.status === "rejected" && <p className="muted center">这一页没有放入你们的日记。婉拒只改变这一次记录，不会上链。</p>}
      {open.status === "awaiting-consent" && open.consent[viewer] && <p className="muted center">等待 TA 确认这一页。双方都确认后才能上链。</p>}
      {open.status === "awaiting-consent" && !open.consent[viewer] && <>
        <p className="muted">TA 想把这一刻写进你们的日记。确认后，这一页就可以上链。</p>
        <Button disabled={busy} onClick={() => act({ action: "diary-consent", diaryId: open.id })}>一起留下这一页</Button>
        <Button className="secondary" disabled={busy} onClick={() => act({ action: "diary-reject", diaryId: open.id })}>先不放进去</Button>
      </>}
      {open.status === "ready" && <div className="chain-panel">
        <p className="chain-title">写入区块链</p>
        {!open.chain?.confirmedAt && <ul className="chain-steps">
          <li className={walletAccount ? "done" : ""}>连接钱包{walletAccount ? ` ✓ ${walletAccount.slice(0, 6)}…${walletAccount.slice(-4)}` : ""}{!walletAccount && <button className="text-button" onClick={onOpenWallet}>去连接</button>}</li>
          <li className={bindNeeded || !wallets.a || !wallets.b ? "" : "done"}>
            绑定双方钱包 {wallets.a && wallets.b ? "✓" : ""}
            {bindNeeded && <button className="text-button" disabled={busy} onClick={() => act({ action: "wallet-bind", address: walletAccount })}>绑定我的钱包</button>}
            {!wallets[other] && <small> 等待 TA 绑定</small>}
          </li>
          <li className={contractReady ? "done" : ""}>部署纪念合约 {contractReady ? "✓" : "未部署"}</li>
        </ul>}
        {open.chain?.confirmedAt ? <div className="chain-done">
          <p className="pink center">这一刻，已经留下。</p>
          <p className="muted center">双方确认交易都已写入 BOT Chain，记录不可篡改。</p>
        </div> : open.chain?.txs.some(tx => tx.by === viewer) ? <div className="chain-done">
          <p className="center">你的确认交易已写入，等待 TA 也写入这一页。</p>
        </div> : contractReady && wallets.a && wallets.b && walletAccount ? <>
          <p className="muted">点击后请在钱包中确认交易。这是你的确认交易，TA 也会各自发起一笔。</p>
          <Button disabled={chainBusy || busy} onClick={() => writeDiaryToChain(open)}>{chainBusy ? "正在写入区块链…" : "写入区块链"}</Button>
        </> : <p className="muted">合约未部署或钱包未就绪时，这一页保持链下预览，不会生成模拟交易。</p>}
        {(open.chain?.txs.length ?? 0) > 0 && <div className="tx-list">
          {(["a", "b"] as UserId[]).map(id => open.chain?.txs.find(tx => tx.by === id)).map((tx, index) => tx && <a key={index} className="tx-link" href={explorerTx(tx.hash)} target="_blank" rel="noopener noreferrer">查看 {tx.by.toUpperCase()} 的确认交易 ↗</a>)}
        </div>}
        {pendingReport?.diaryId === open.id && <p className="error" role="alert">交易已成功但回报失败，可重试同步。哈希：{pendingReport.hash}<button className="text-button" onClick={() => reportTx(pendingReport.diaryId, pendingReport.hash)}>重试</button></p>}
        {chainError && <p className="error" role="alert">{chainError}</p>}
      </div>}
      <details className="demo-details"><summary>核对信息</summary>
        <p className="address">内容指纹：{open.contentHash}</p>
        <p>指纹由节点类型、日期、标题和这句话生成。原文保存在应用里，不会上链；用同一内容重算指纹，可以核对这一页有没有被改过。</p>
      </details>
    </Modal>}
  </>;
}
