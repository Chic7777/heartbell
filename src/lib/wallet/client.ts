"use client";
import { createWalletClient, custom, type Address, type EIP1193Provider } from "viem";
import { botChain } from "../chain/config";
type Provider = EIP1193Provider & { on?: (name: string, listener: (...args: unknown[]) => void) => void; removeListener?: (name: string, listener: (...args: unknown[]) => void) => void };
declare global { interface Window { ethereum?: Provider; } }
export function browserWallet() {
  if (!window.ethereum) throw new Error("请使用已安装 MetaMask 等钱包扩展的浏览器。");
  return createWalletClient({ chain: botChain, transport: custom(window.ethereum) });
}
export async function connectWallet(): Promise<Address> {
  const [account] = await browserWallet().requestAddresses();
  if (!account) throw new Error("未获得钱包账户授权。");
  return account;
}
export async function switchToBotChain() {
  const wallet = browserWallet();
  try { await wallet.switchChain({ id: botChain.id }); }
  catch (error) {
    const code = (error as { code?: number; cause?: { code?: number } });
    if (code.code !== 4902 && code.cause?.code !== 4902) throw error;
    await wallet.addChain({ chain: botChain });
    await wallet.switchChain({ id: botChain.id });
  }
}
