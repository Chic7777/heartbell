"use client";
// 我的（计划书 UI-16）：档案、声明、授权管理、钱包、验证状态、账本、导出。
import { useState } from "react";
import { Button, Card, Chip } from "../ui";
import { Modal } from "../modal";
import { WalletPanel } from "../wallet-panel";
import type { V2StateView } from "../../lib/domain/view-dtos";
import { intentionLabels } from "../../lib/domain/v2-types";
import { exportEvidence } from "./us-tab";

export function MeDrawer({ open, onClose, view, busy, act, needsAdult }: {
  open: boolean; onClose: () => void; view: V2StateView | null; busy: boolean;
  act(path: string, body?: Record<string, unknown>): Promise<boolean>;
  needsAdult: boolean;
}) {
  const [walletOpen, setWalletOpen] = useState(false);
  const [intentionOpen, setIntentionOpen] = useState(false);
  const [intention, setIntention] = useState<"serious" | "open" | "not_now">("open");
  const [contact, setContact] = useState("");
  if (!open || !view) return null;
  const me = view.me;
  return <>
    <Modal title="我的" onClose={onClose}>
      <div className="profile-head">
        <div className="reveal-avatar">{me.profile.avatar}</div>
        <div>
          <h3 style={{ margin: 0 }}>{me.profile.nickname}</h3>
          <span className="intent-badge">意向：{intentionLabels[me.profile.intention]}</span>
        </div>
      </div>
      <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
        <Button className="secondary small" onClick={() => { setIntention(me.profile.intention); setContact(me.profile.contact ?? ""); setIntentionOpen(true); }}>编辑我的声明</Button>
      </div>

      <div className="me-row"><b>成年声明</b>{me.adultDeclared ? <Chip tone="success">已完成（演示声明）</Chip> : <Chip tone="warning">未完成</Chip>}</div>
      <p className="muted">成年声明与真实年龄核验是两回事；未接入真人服务时不显示“真人认证”。</p>

      <h3 style={{ marginTop: 16 }}>平台已验证事项</h3>
      {me.verificationLevels.map(v => <div className="me-row" key={v.label}><b>{v.label}</b>{v.verified ? <Chip tone="success">已验证</Chip> : <Chip tone="outline">未接入</Chip>}</div>)}

      <h3 style={{ marginTop: 16 }}>演示资产（与履约分完全独立）</h3>
      <div className="me-row"><b>演示点数</b><span className="points">{me.balance} 点（不可购买/转让/提现）</span></div>
      <div className="me-row"><b>玫瑰演示券</b><span className="points">{me.roseTickets} 张（不可实际核销）</span></div>
      <p className="muted">履约分是 0–100 的参考值：不能充值、消费或换礼物；投入或领取多少点数不影响履约分。</p>

      <h3 style={{ marginTop: 16 }}>我发出的授权</h3>
      {me.grantsIssued.length === 0 && <p className="muted">还没有向任何人授权。授权按范围（联系方式 / 履约摘要）分别授予，默认 72 小时有效，可随时撤销。</p>}
      <div className="grant-list">
        {me.grantsIssued.map(g => (
          <div className={`grant-item ${g.active ? "" : "expired"}`} key={g.id}>
            <span>{g.audienceLabel} · {g.scopeLabel}</span>
            {g.active ? <Chip tone="success">生效中</Chip> : g.revokedAt ? <Chip tone="outline">已撤销</Chip> : <Chip tone="outline">已过期</Chip>}
            {g.active && <button className="text-button" disabled={busy} onClick={() => act("share-grants/revoke", { grantId: g.id })}>撤销</button>}
          </div>
        ))}
      </div>
      <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
        <Button className="secondary small" disabled={busy} onClick={() => act("share-grants", { scope: "trust_summary" })}>授权查看我的履约摘要</Button>
        <Button className="secondary small" disabled={busy} onClick={() => act("share-grants", { scope: "profile_contact" })}>授权联系方式</Button>
      </div>

      <h3 style={{ marginTop: 16 }}>钱包</h3>
      <p className="muted">钱包仅用于真实存证签名（当前 preview 模式无需钱包）。钱包断开只影响签名，不影响已保存的日记。</p>
      <WalletPanel open={walletOpen} onOpenChange={setWalletOpen} />

      <h3 style={{ marginTop: 16 }}>最近账本</h3>
      <div className="ledger-mini">
        {me.ledger.slice(0, 8).map(e => (
          <div key={e.id}>
            <span className="muted">{e.note || e.type}</span>
            <span className={e.to.startsWith("user:") ? "plus" : "minus"}>{e.to.startsWith("user:") ? "+" : "−"}{e.amount}{e.unit === "rose-ticket" ? " 券" : " 点"}</span>
          </div>
        ))}
      </div>

      {view.modes.chainMode === "preview" && <p className="muted" style={{ marginTop: 12 }}>存证模式：preview（未连接真实链）。已生成的承诺指纹可在各记录的“查看证据”中导出证据包核验。</p>}
      <details className="demo-details"><summary>运行模式</summary>
        <p>APP_MODE={view.modes.appMode} · CHAIN_MODE={view.modes.chainMode} · REWARD_MODE={view.modes.rewardMode} · CLAIM_VERIFIER_MODE={view.modes.claimVerifierMode}</p>
        <p>虚拟业务时间：{new Date(view.modes.virtualNow).toLocaleString("zh-CN")}（演示台可推进，不修改系统或链上时间）</p>
      </details>
    </Modal>

    {intentionOpen && <Modal title="编辑我的声明" onClose={() => setIntentionOpen(false)}>
      <label className="field-label">交往意向（本人主动公开）</label>
      <div className="choice-list">
        {(Object.keys(intentionLabels) as (keyof typeof intentionLabels)[]).map(key => (
          <button key={key} className={intention === key ? "chosen" : ""} onClick={() => setIntention(key)}>{intentionLabels[key]}</button>
        ))}
      </div>
      <label className="field-label" htmlFor="me-contact">联系方式（仅授权后对特定连接可见）</label>
      <input id="me-contact" maxLength={60} value={contact} placeholder="例如：微信 demo-xxx" onChange={e => setContact(e.target.value)} />
      <p className="muted">交往意向由你本人选择并主动公开；双方知情同意的交往选择本身不构成失信，也不进入履约分。</p>
      <Button disabled={busy} onClick={async () => { if (await act("profile", { intention, contact: contact.trim() || null })) setIntentionOpen(false); }}>保存</Button>
    </Modal>}
  </>;
}
