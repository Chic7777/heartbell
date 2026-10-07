"use client";
import { useEffect, useState } from "react";
import { Button } from "./ui";
import { Modal } from "./modal";
import { browserWallet, connectWallet, switchToBotChain } from "../lib/wallet/client";
export function WalletPanel({ open, onOpenChange, onAccountChange }: { open: boolean; onOpenChange: (open: boolean) => void; onAccountChange?: (account: string | null, chainId: number | null) => void }) {
  const [account, setAccount] = useState<string | null>(null);
  const [chain, setChain] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  function toggle(value: boolean) { onOpenChange(value); }
  useEffect(() => {
    const provider = window.ethereum;
    const clear = () => { setAccount(null); setChain(null); };
    provider?.on?.("accountsChanged", clear); provider?.on?.("chainChanged", clear);
    return () => { provider?.removeListener?.("accountsChanged", clear); provider?.removeListener?.("chainChanged", clear); };
  }, []);
  useEffect(() => { onAccountChange?.(account, chain); }, [account, chain, onAccountChange]);
  async function run(switchNetwork: boolean) {
    setBusy(true); setError("");
    try { if (switchNetwork) await switchToBotChain(); setAccount(await connectWallet()); setChain(await browserWallet().getChainId()); }
    catch (e) { setError(!window.ethereum ? "当前浏览器没有钱包扩展。请在安装了 MetaMask 的 Chrome 或 Edge 中打开此网址。你也可以关闭此窗口，继续体验演示。" : e instanceof Error ? e.message : "钱包操作失败"); }
    finally { setBusy(false); }
  }
  return <><button className="wallet-trigger" onClick={() => toggle(true)} aria-haspopup="dialog">{account ? `${account.slice(0, 6)}…${account.slice(-4)}` : "连接钱包"}</button>
    {open && <Modal title="我的钱包" onClose={() => toggle(false)}>
      <p className="muted">钱包用于情侣日记上链：连接后，双方各自发起一笔确认交易，把这一页写入 BOT Chain。</p>
      {account ? <><p className="address">{account}</p><p>网络：{chain === 677 ? "BOT Chain" : `Chain ${chain}`}</p><Button disabled={busy} onClick={() => run(true)}>切换到 BOT Chain</Button><Button className="secondary" onClick={() => { setAccount(null); setChain(null); }}>清除本页连接显示</Button></> : <Button disabled={busy} onClick={() => run(false)}>{busy ? "等待钱包回应…" : "连接浏览器钱包"}</Button>}
      {error && <p className="error" role="alert">{error}</p>}
      <details className="demo-details"><summary>钱包接入说明</summary><p>清除显示不会撤销钱包授权。A/B 为演示身份，钱包绑定仅为演示记录，不是登录认证。同一浏览器可能共享钱包账户；双人上链请使用不同浏览器或隔离配置。合约未部署时不会发送交易。</p></details>
    </Modal>}
  </>;
}
