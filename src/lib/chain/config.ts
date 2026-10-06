import { defineChain, isAddress } from "viem";
export const botChain = defineChain({
  id: 677, name: "BOT Chain", nativeCurrency: { name: "BOT", symbol: "BOT", decimals: 18 },
  rpcUrls: { default: { http: ["https://rpc.botchain.ai"] } },
  blockExplorers: { default: { name: "BOT Scan", url: "https://scan.botchain.ai" } },
});
export function memoryContractAddress() {
  const address = process.env.NEXT_PUBLIC_MEMORY_CONTRACT_ADDRESS;
  if (!address || !isAddress(address) || /^0x0{40}$/i.test(address)) return null;
  return address;
}
