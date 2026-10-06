import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import solc from "solc";
// V1/V2 合约统一编译：Paris EVM 目标（沿用现有配置，按目标链联调确认兼容性）。
const files = ["HeartbellMemories.sol", "HeartbellCommitmentRegistry.sol"];
const input = {
  language: "Solidity",
  sources: Object.fromEntries(files.map(file => [file, { content: readFileSync(`contracts/${file}`, "utf8") }])),
  settings: {
    evmVersion: "paris",
    optimizer: { enabled: true, runs: 200 },
    outputSelection: { "*": { "*": ["abi", "evm.bytecode.object"] } },
  },
};
const output = JSON.parse(solc.compile(JSON.stringify(input)));
for (const error of output.errors ?? []) console.log(error.formattedMessage);
if ((output.errors ?? []).some(e => e.severity === "error")) process.exit(1);
mkdirSync("contracts/artifacts", { recursive: true });
for (const file of files) {
  const name = file.replace(".sol", "");
  const contract = output.contracts[file][name];
  if (!contract) { console.error(`Missing contract ${name} in ${file}`); process.exit(1); }
  writeFileSync(`contracts/artifacts/${name}.json`, JSON.stringify(contract, null, 2));
  console.log(`${name}: compiled (solc ${solc.version()}, EVM paris, bytecode ${contract.evm.bytecode.object.length / 2 - 1} bytes)`);
}
console.log("Contracts compiled successfully. No deployment or transaction performed.");
