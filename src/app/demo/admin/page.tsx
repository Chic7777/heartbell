"use client";
// 演示审核台（计划书 7.2 /demo/admin）：仅 APP_MODE=demo 且本地演示开放；正式环境服务端拒绝。
import { useCallback, useEffect, useState } from "react";
import { Button, Card, Chip, ErrorBanner } from "../../../components/ui";

interface AdminSnapshot {
  modes: { appMode: string; chainMode: string; rewardMode: string; claimVerifierMode: string; virtualNow: number };
  chainFault: boolean;
  claims: { id: string; planId: string; status: string; evidenceNote: string; targetOccurredAt: number; decisionNote: string | null }[];
  exceptions: { id: string; endedReason: string | null }[];
  disputes: { id: string; targetType: string; targetId: string; note: string; raisedBy: string; resolvedAt: number | null }[];
  accounts: Record<string, number>;
  relationships: { id: string; status: string; members: string[] }[];
  plans: { id: string; status: string; revision: number }[];
  anchorJobs: { id: string; recordId: string; status: string; commitment: string; attempts: number }[];
}

export default function AdminPage() {
  const [snap, setSnap] = useState<AdminSnapshot | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const refresh = useCallback(async () => {
    try {
      const response = await fetch("/api/v2/admin/snapshot", { cache: "no-store" });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error?.message ?? "无法访问演示台");
      setSnap(json.data);
      setError("");
    } catch (e) { setError(e instanceof Error ? e.message : "无法访问演示台"); }
  }, []);
  useEffect(() => { refresh(); const t = setInterval(refresh, 2000); return () => clearInterval(t); }, [refresh]);
  async function act(path: string, body: Record<string, unknown>) {
    setBusy(true);
    try {
      const response = await fetch(`/api/v2/${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error?.message ?? "操作失败");
      await refresh();
    } catch (e) { setError(e instanceof Error ? e.message : "操作失败"); }
    finally { setBusy(false); }
  }
  return <main className="admin-wrap">
    <p className="eyebrow">HEARTBELL · 演示审核台（仅 APP_MODE=demo）</p>
    <h1>演示台</h1>
    <p className="muted">场景重置、虚拟业务时间、审核模拟与故障模拟。正式环境服务端拒绝所有演示台接口。审核台模拟不代表真实婚姻核验或真实认证。</p>
    {error && <ErrorBanner message={error} onDismiss={() => setError("")} />}
    {!snap ? <p>连接中……</p> : <>
      <Card>
        <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
          <div>
            <h3 style={{ margin: 0 }}>虚拟业务时钟</h3>
            <div className="virtual-clock">{new Date(snap.modes.virtualNow).toLocaleString("zh-CN")}</div>
            <p className="muted">只推进业务时间，不修改系统时间或链上时间。</p>
          </div>
          <div className="admin-time-row">
            <Button className="secondary small" disabled={busy} onClick={() => act("admin/advance-time", { ms: 3_600_000 })}>+1 小时</Button>
            <Button className="secondary small" disabled={busy} onClick={() => act("admin/advance-time", { ms: 86_400_000 })}>+1 天</Button>
            <Button className="secondary small" disabled={busy} onClick={() => act("admin/advance-time", { ms: 25 * 86_400_000 })}>+25 天</Button>
            <Button className="secondary small" disabled={busy} onClick={() => act("admin/advance-time", { ms: 366 * 86_400_000 })}>+366 天（跨过期）</Button>
          </div>
        </div>
      </Card>
      <div className="admin-grid">
        <Card><h3>账户（演示点数）</h3>
          <table className="admin-table"><tbody>
            <tr><th>A（小铃）</th><td className="points">{snap.accounts.userA}</td></tr>
            <tr><th>B（阿响）</th><td className="points">{snap.accounts.userB}</td></tr>
            <tr><th>奖励预算池</th><td className="points">{snap.accounts.rewardPool}</td></tr>
            <tr><th>玫瑰券库存</th><td className="points">{snap.accounts.roseStock}</td></tr>
            <tr><th>演示失效账户</th><td className="points">{snap.accounts.forfeitAccount}</td></tr>
          </tbody></table>
        </Card>
        <Card><h3>场景与故障</h3>
          <p className="muted">重置将清空本轮演示状态（内存数据，重启也会清空）。</p>
          <Button className="danger" disabled={busy} onClick={() => { if (confirm("重置演示场景？")) act("admin/reset", {}); }}>重置演示场景</Button>
          <p className="muted" style={{ marginTop: 10 }}>链故障模拟：{snap.chainFault ? "已开启（存证任务将写入失败）" : "关闭"}</p>
          <Button className="secondary" disabled={busy} onClick={() => act("admin/chain-fault", { active: !snap.chainFault })}>{snap.chainFault ? "解除链故障" : "开启链故障"}</Button>
        </Card>
        <Card><h3>达成申请审核（演示）</h3>
          {snap.claims.length === 0 && <p className="muted">暂无申请。</p>}
          <table className="admin-table"><tbody>
            {snap.claims.map(c => <tr key={c.id}>
              <th>{c.id.slice(0, 12)}<br /><small className="muted">{c.evidenceNote}</small></th>
              <td>
                <Chip tone={c.status === "approved" ? "success" : c.status === "rejected" ? "danger" : "warning"}>{c.status}</Chip>
                {c.status === "submitted" || c.status === "need_more" ? <div style={{ display: "flex", gap: 6, marginTop: 6, flexWrap: "wrap" }}>
                  <Button className="secondary small" disabled={busy} onClick={() => act("admin/claims/decision", { claimId: c.id, decision: "approve", note: "演示审核通过" })}>通过</Button>
                  <Button className="secondary small" disabled={busy} onClick={() => act("admin/claims/decision", { claimId: c.id, decision: "need_more", note: "请补充演示材料" })}>补材料</Button>
                  <Button className="secondary small" disabled={busy} onClick={() => act("admin/claims/decision", { claimId: c.id, decision: "reject", note: "演示不通过" })}>不通过</Button>
                </div> : null}
              </td>
            </tr>)}
          </tbody></table>
        </Card>
        <Card><h3>例外复核</h3>
          {snap.exceptions.length === 0 && <p className="muted">暂无待复核计划。</p>}
          {snap.exceptions.map(p => <div key={p.id} style={{ marginBottom: 10 }}>
            <p style={{ margin: 0 }}><code>{p.id}</code> · {p.endedReason ?? "—"}</p>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              <Button className="secondary small" disabled={busy} onClick={() => act("admin/exception/resolve", { planId: p.id, decision: "refund" })}>例外退款</Button>
              <Button className="secondary small" disabled={busy} onClick={() => act("admin/exception/resolve", { planId: p.id, decision: "forfeit" })}>按规则失效</Button>
              <Button className="secondary small" disabled={busy} onClick={() => act("admin/exception/resolve", { planId: p.id, decision: "back_to_review" })}>返回核验</Button>
            </div>
          </div>)}
        </Card>
        <Card><h3>履约争议复核</h3>
          {snap.disputes.filter(d => !d.resolvedAt && d.targetType === "trust").length === 0 && <p className="muted">暂无未决争议。</p>}
          {snap.disputes.filter(d => !d.resolvedAt && d.targetType === "trust").map(d => <div key={d.id} style={{ marginBottom: 10 }}>
            <p style={{ margin: 0 }}>{d.note}（<code>{d.targetId}</code>）</p>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              <Button className="secondary small" disabled={busy} onClick={() => act("admin/trust-dispute/resolve", { promiseId: d.targetId, finalResult: "fulfilled" })}>认定已履行</Button>
              <Button className="secondary small" disabled={busy} onClick={() => act("admin/trust-dispute/resolve", { promiseId: d.targetId, finalResult: "unfulfilled" })}>认定未履行</Button>
              <Button className="secondary small" disabled={busy} onClick={() => act("admin/trust-dispute/resolve", { promiseId: d.targetId, finalResult: "waived" })}>豁免</Button>
            </div>
          </div>)}
        </Card>
        <Card><h3>关系与计划</h3>
          <table className="admin-table"><tbody>
            {snap.relationships.map(r => <tr key={r.id}><th>{r.id}</th><td>{r.members.join(" ↔ ")} · {r.status}</td></tr>)}
            {snap.plans.map(p => <tr key={p.id}><th>{p.id}</th><td>{p.status} · rev {p.revision}</td></tr>)}
          </tbody></table>
        </Card>
        <Card><h3>存证任务（preview）</h3>
          <table className="admin-table"><tbody>
            {snap.anchorJobs.length === 0 && <tr><td className="muted">暂无任务</td></tr>}
            {snap.anchorJobs.map(j => <tr key={j.id}><th><code>{j.recordId}</code></th><td>{j.status} · 尝试 {j.attempts} 次<div className="address">{j.commitment}</div></td></tr>)}
          </tbody></table>
        </Card>
      </div>
    </>}
  </main>;
}
