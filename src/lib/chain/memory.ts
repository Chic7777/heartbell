"use client";
import { createPublicClient, encodeAbiParameters, http, keccak256, parseAbi, type Address, type Hex } from "viem";
import { botChain, memoryContractAddress } from "./config";
import { browserWallet } from "../wallet/client";
export const memoryAbi = parseAbi([
  "function approveMemory(bytes32 id, bytes32 contentHash, address a, address b)",
  "function memories(bytes32) view returns (bytes32 contentHash, address participantA, address participantB, bool approvedA, bool approvedB, uint64 confirmedAt)",
]);
export function chainMemoryId(contentHash: Hex, a: Address, b: Address): Hex {
  return keccak256(encodeAbiParameters([{ type: "bytes32" }, { type: "address" }, { type: "address" }], [contentHash, a, b]));
}
// 双方地址按小写排序后再计算纪念 ID，确保两个人各自发起交易时得到同一个 ID。
export function canonicalPair(a: Address, b: Address): [Address, Address] {
  return a.toLowerCase() <= b.toLowerCase() ? [a, b] : [b, a];
}
export async function approveChainMemory(contentHash: Hex, a: Address, b: Address) {
  const address = memoryContractAddress();
  if (!address) throw new Error("请先部署合约并配置 NEXT_PUBLIC_MEMORY_CONTRACT_ADDRESS。");
  if (a.toLowerCase() === b.toLowerCase()) throw new Error("双方必须使用不同钱包。");
  const wallet = browserWallet();
  const [account] = await wallet.requestAddresses();
  if (!account || ![a.toLowerCase(), b.toLowerCase()].includes(account.toLowerCase())) throw new Error("当前账户不是纪念参与者。");
  if (await wallet.getChainId() !== botChain.id) throw new Error("请先切换到 BOT Chain。");
  const publicClient = createPublicClient({ chain: botChain, transport: http() });
  const [pa, pb] = canonicalPair(a, b);
  const id = chainMemoryId(contentHash, pa, pb);
  const { request } = await publicClient.simulateContract({ address, abi: memoryAbi, functionName: "approveMemory", args: [id, contentHash, pa, pb], account });
  const transactionHash = await wallet.writeContract(request);
  const receipt = await publicClient.waitForTransactionReceipt({ hash: transactionHash });
  if (receipt.status !== "success") throw new Error(`交易失败：${transactionHash}`);
  const record = await publicClient.readContract({ address, abi: memoryAbi, functionName: "memories", args: [id] });
  return { id, transactionHash, confirmed: record[3] && record[4], explorerUrl: `${botChain.blockExplorers.default.url}/tx/${transactionHash}` };
}
export async function approveDiaryOnChain(contentHash: Hex, a: Address, b: Address) {
  return approveChainMemory(contentHash, a, b);
}
