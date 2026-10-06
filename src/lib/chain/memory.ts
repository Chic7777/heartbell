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
export async function approveChainMemory(contentHash: Hex, a: Address, b: Address) {
  const address = memoryContractAddress();
  if (!address) throw new Error("请先部署合约并配置 NEXT_PUBLIC_MEMORY_CONTRACT_ADDRESS。");
  if (a.toLowerCase() === b.toLowerCase()) throw new Error("双方必须使用不同钱包。");
  const wallet = browserWallet();
  const [account] = await wallet.requestAddresses();
  if (!account || ![a.toLowerCase(), b.toLowerCase()].includes(account.toLowerCase())) throw new Error("当前账户不是纪念参与者。");
  if (await wallet.getChainId() !== botChain.id) throw new Error("请先切换到 BOT Chain。");
  const publicClient = createPublicClient({ chain: botChain, transport: http() });
  const id = chainMemoryId(contentHash, a, b);
  const { request } = await publicClient.simulateContract({ address, abi: memoryAbi, functionName: "approveMemory", args: [id, contentHash, a, b], account });
  const transactionHash = await wallet.writeContract(request);
  const receipt = await publicClient.waitForTransactionReceipt({ hash: transactionHash });
  if (receipt.status !== "success") throw new Error(`交易失败：${transactionHash}`);
  const record = await publicClient.readContract({ address, abi: memoryAbi, functionName: "memories", args: [id] });
  return { id, transactionHash, confirmed: record[3] && record[4], explorerUrl: `${botChain.blockExplorers.default.url}/tx/${transactionHash}` };
}
