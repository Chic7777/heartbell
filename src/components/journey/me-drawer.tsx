"use client";
// 我的（计划书 UI-16 / v2.1）：完整资料编辑（称呼/性取向/年龄窗口/介绍/爱好标签/MBTI）、
// 成年声明（一次性，在资料内勾选）、联系方式多栏（微信/手机号默认 + 可添加）、授权管理、钱包、账本。
import { useEffect, useState } from "react";
import { Button, Card, Chip } from "../ui";
import { Modal } from "../modal";
import { WalletPanel } from "../wallet-panel";
import type { V2StateView } from "../../lib/domain/view-dtos";
import { intentionLabels, mbtiOptions, orientationLabels, type ContactEntry, type Intention, type Orientation } from "../../lib/domain/v2-types";
import { exportEvidence } from "./us-tab";

const emptyDraft = (v: V2StateView): {
  nickname: string; ageWindow: string; orientation: Orientation | ""; mbti: string;
  bio: string; intention: Intention; interests: string[]; contacts: ContactEntry[];
} => ({
  nickname: v.me.profile.nickname,
  ageWindow: v.me.profile.ageWindow,
  orientation: v.me.profile.orientation ?? "",
  mbti: v.me.profile.mbti ?? "",
  bio: v.me.profile.bio,
  intention: v.me.profile.intention,
  interests: [...v.me.profile.interests],
  contacts: v.me.profile.contacts.length
    ? v.me.profile.contacts.map(c => ({ ...c }))
    : [{ id: "c-wechat", label: "微信", value: "" }, { id: "c-phone", label: "手机号", value: "" }],
});

export function MeDrawer({ open, onClose, view, busy, act }: {
  open: boolean; onClose: () => void; view: V2StateView | null; busy: boolean;
  act(path: string, body?: Record<string, unknown>): Promise<boolean>;
}) {
  const [walletOpen, setWalletOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [draft, setDraft] = useState<ReturnType<typeof emptyDraft> | null>(null);
  const [interestInput, setInterestInput] = useState("");
  useEffect(() => {
    if (editOpen && view) setDraft(emptyDraft(view));
  }, [editOpen, view]);
  if (!open || !view) return null;
  const me = view.me;
  const p = me.profile;

  function saveProfile() {
    if (!draft) return;
    act("profile", {
      nickname: draft.nickname.trim() || p.nickname,
      ageWindow: draft.ageWindow.trim(),
      orientation: draft.orientation || null,
      mbti: draft.mbti || null,
      bio: draft.bio.trim(),
      intention: draft.intention,
      interests: draft.interests,
      contacts: draft.contacts.filter(c => c.label.trim() && c.value.trim()),
    }).then(ok => { if (ok) setEditOpen(false); });
  }

  return <>
    <Modal title="我的" onClose={onClose}>
      <div className="profile-head">
        <div className="reveal-avatar">{p.avatar}</div>
        <div>
          <h3 style={{ margin: 0 }}>{p.nickname}</h3>
          <span className="intent-badge">意向：{intentionLabels[p.intention]}</span>
        </div>
      </div>
      <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
        <Button className="secondary small" onClick={() => setEditOpen(true)}>编辑个人资料</Button>
      </div>

      <h3 style={{ marginTop: 16 }}>我的资料</h3>
      <div className="me-row"><b>年龄窗口</b><span>{p.ageWindow || "未填写"}</span></div>
      <div className="me-row"><b>性取向</b><span>{p.orientation ? orientationLabels[p.orientation] : "未填写"}</span></div>
      <div className="me-row"><b>MBTI</b><span>{p.mbti ?? "未填写"}</span></div>
      <div className="me-row"><b>一句话介绍</b><span style={{ textAlign: "right" }}>{p.bio || "未填写"}</span></div>
      <div className="me-row" style={{ alignItems: "flex-start" }}><b>爱好标签</b>
        <span className="interest-tags" style={{ justifyContent: "flex-end" }}>
          {p.interests.length ? p.interests.map(i => <span key={i}>{i}</span>) : "未填写"}
        </span>
      </div>

      <div className="me-row"><b>成年声明</b>
        {me.adultDeclared
          ? <Chip tone="success">已声明（演示声明，非真人核验）</Chip>
          : <label className="checkbox" style={{ margin: 0 }}>
              <input type="checkbox" disabled={busy} onChange={e => { if (e.target.checked) act("declare-adult"); }} />
              我已年满 18 岁（勾选一次即可，无需每次重复）
            </label>}
      </div>
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
      <p className="muted">钱包仅用于真实存证签名（当前 preview 模式无需钱包，存证不会报“需要钱包”的错误）。钱包断开只影响签名，不影响已保存日记。</p>
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

      {view.modes.chainMode === "preview" && <p className="muted" style={{ marginTop: 12 }}>存证模式：preview（未连接真实链，无需钱包）。已生成的承诺指纹可在各记录的“查看证据”中导出证据包核验。</p>}
      <details className="demo-details"><summary>运行模式</summary>
        <p>APP_MODE={view.modes.appMode} · CHAIN_MODE={view.modes.chainMode} · REWARD_MODE={view.modes.rewardMode} · CLAIM_VERIFIER_MODE={view.modes.claimVerifierMode}</p>
        <p>虚拟业务时间：{new Date(view.modes.virtualNow).toLocaleString("zh-CN")}（演示台可推进，不修改系统或链上时间）</p>
      </details>
    </Modal>

    {editOpen && draft && <Modal title="编辑个人资料" onClose={() => setEditOpen(false)}>
      <label className="field-label" htmlFor="pf-nickname">称呼</label>
      <input id="pf-nickname" maxLength={16} value={draft.nickname} onChange={e => setDraft({ ...draft, nickname: e.target.value })} />
      <label className="field-label" htmlFor="pf-age">年龄窗口（如 24–32）</label>
      <input id="pf-age" maxLength={12} placeholder="如 24–32" value={draft.ageWindow} onChange={e => setDraft({ ...draft, ageWindow: e.target.value })} />
      <label className="field-label">性取向</label>
      <select value={draft.orientation} aria-label="性取向" onChange={e => setDraft({ ...draft, orientation: e.target.value as Orientation | "" })}>
        <option value="">未填写</option>
        {(Object.keys(orientationLabels) as Orientation[]).map(o => <option key={o} value={o}>{orientationLabels[o]}</option>)}
      </select>
      <label className="field-label">MBTI</label>
      <select value={draft.mbti} aria-label="MBTI" onChange={e => setDraft({ ...draft, mbti: e.target.value })}>
        <option value="">未填写</option>
        {mbtiOptions.map(m => <option key={m} value={m}>{m}</option>)}
      </select>
      <label className="field-label" htmlFor="pf-bio">一句话介绍（响铃阶段对方可见的最小资料）</label>
      <input id="pf-bio" maxLength={120} value={draft.bio} onChange={e => setDraft({ ...draft, bio: e.target.value })} />
      <label className="field-label">爱好标签（最多 8 个）</label>
      <div className="interest-tags">
        {draft.interests.map((tag, i) => (
          <span key={tag} style={{ cursor: "pointer" }} title="点击移除"
            onClick={() => setDraft({ ...draft, interests: draft.interests.filter((_, j) => j !== i) })}>
            {tag} ×
          </span>
        ))}
      </div>
      <div className="trait-row" style={{ marginTop: 6 }}>
        <input aria-label="新标签" maxLength={10} placeholder="输入后回车添加" value={interestInput}
          onChange={e => setInterestInput(e.target.value)}
          onKeyDown={e => {
            if (e.key === "Enter" && interestInput.trim() && draft.interests.length < 8 && !draft.interests.includes(interestInput.trim())) {
              setDraft({ ...draft, interests: [...draft.interests, interestInput.trim()] });
              setInterestInput("");
            }
          }} />
        <Button className="secondary small" style={{ marginTop: 0 }}
          onClick={() => {
            if (interestInput.trim() && draft.interests.length < 8 && !draft.interests.includes(interestInput.trim())) {
              setDraft({ ...draft, interests: [...draft.interests, interestInput.trim()] });
              setInterestInput("");
            }
          }}>添加</Button>
      </div>
      <label className="field-label">联系方式（1–5 栏，授权后对方可见）</label>
      <div style={{ display: "grid", gap: 8 }}>
        {draft.contacts.map((c, i) => (
          <div className="trait-row" key={i}>
            <input aria-label={`联系方式 ${i + 1} 名称`} maxLength={12} value={c.label} placeholder="微信 / 手机号 / 自定义"
              onChange={e => setDraft({ ...draft, contacts: draft.contacts.map((x, j) => j === i ? { ...x, label: e.target.value } : x) })} />
            <div style={{ display: "flex", gap: 6 }}>
              <input aria-label={`联系方式 ${i + 1} 内容`} maxLength={40} value={c.value} placeholder="号码 / ID"
                onChange={e => setDraft({ ...draft, contacts: draft.contacts.map((x, j) => j === i ? { ...x, value: e.target.value } : x) })} />
              <button className="text-button" aria-label="删除此栏" onClick={() => setDraft({ ...draft, contacts: draft.contacts.filter((_, j) => j !== i) })}>×</button>
            </div>
          </div>
        ))}
      </div>
      {draft.contacts.length < 5 && <button className="text-button" onClick={() => setDraft({ ...draft, contacts: [...draft.contacts, { id: `c-new-${draft.contacts.length}`, label: "", value: "" }] })}>+ 添加一栏联系方式</button>}
      <label className="field-label">交往意向</label>
      <div className="choice-list">
        {(Object.keys(intentionLabels) as Intention[]).map(key => (
          <button key={key} className={draft.intention === key ? "chosen" : ""} onClick={() => setDraft({ ...draft, intention: key })}>{intentionLabels[key]}</button>
        ))}
      </div>
      <p className="muted">性取向与年龄窗口由你本人填写并主动公开；双方知情同意的交往选择本身不构成失信，也不进入履约分。</p>
      <Button disabled={busy || !draft.nickname.trim() || !draft.bio.trim() || draft.contacts.some(c => (c.label.trim() ? 1 : 0) !== (c.value.trim() ? 1 : 0))}
        onClick={saveProfile}>保存资料</Button>
    </Modal>}
  </>;
}
