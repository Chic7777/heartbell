// V2 合约本地行为测试（npm run verify:v2 的第二段）。
// 在 @ethereumjs/evm 中部署真实编译产物并执行 T11/T12 行为验证：权限、零承诺、
// 重复登记、暂停、writer 轮换、两步管理员转移；并检查交易输入与事件不携带身份数据。
import { readFileSync } from "node:fs";
import { EVM } from "@ethereumjs/evm";
import { Common, Mainnet } from "@ethereumjs/common";
import { Address, bytesToHex } from "@ethereumjs/util";
import { SimpleStateManager } from "@ethereumjs/statemanager";
import { createBlock } from "@ethereumjs/block";
import { toFunctionSelector } from "viem";

let passed = 0;
function check(name, condition, detail) {
  if (!condition) { console.error(`FAIL: ${name}${detail !== undefined ? " — " + String(detail).slice(0, 300) : ""}`); process.exit(1); }
  passed += 1;
  console.log(`ok  ${name}`);
}

const artifact = JSON.parse(readFileSync("contracts/artifacts/HeartbellCommitmentRegistry.json", "utf8"));
const bytecode = artifact.evm.bytecode.object;
const admin = new Address(Buffer.from("11".repeat(20), "hex"));
const writer = new Address(Buffer.from("22".repeat(20), "hex"));
const other = new Address(Buffer.from("33".repeat(20), "hex"));

// 本地行为测试使用主网 ChainConfig + Paris 硬分叉（与编译目标一致）；chainId 与执行无关。
const common = new Common({ chain: Mainnet, hardfork: "paris" });
const evm = new EVM({ common, stateManager: new SimpleStateManager() });
// 自定义区块时间戳：合约用 uint64(block.timestamp) 作为登记时间并作为未登记哨兵值
const block = createBlock({ header: { number: 1n, timestamp: 1_791_300_000n, gasLimit: 30_000_000n } }, { common });

const sel = {
  record: toFunctionSelector("record(bytes32)"),
  recordedAt: toFunctionSelector("recordedAt(bytes32)"),
  rotateWriter: toFunctionSelector("rotateWriter(address)"),
  setPaused: toFunctionSelector("setPaused(bool)"),
  transferAdmin: toFunctionSelector("transferAdmin(address)"),
  acceptAdmin: toFunctionSelector("acceptAdmin()"),
};
const err = {
  NotWriter: toFunctionSelector("NotWriter()"),
  ZeroCommitment: toFunctionSelector("ZeroCommitment()"),
  AlreadyRecorded: toFunctionSelector("AlreadyRecorded()"),
  ContractPaused: toFunctionSelector("ContractPaused()"),
  NotAdmin: toFunctionSelector("NotAdmin()"),
  NoPendingAdmin: toFunctionSelector("NoPendingAdmin()"),
};

const padAddress = addr => "0x" + bytesToHex(addr.bytes).replace("0x", "").padStart(64, "0");
function callData(selector, ...words) {
  const parts = [Buffer.from(selector.slice(2), "hex")];
  for (const word of words) {
    const raw = Buffer.from(word.replace("0x", ""), "hex");
    parts.push(Buffer.concat([Buffer.alloc(32 - raw.length), raw]));
  }
  return Buffer.concat(parts);
}
async function call(from, data) {
  const result = await evm.runCall({ to: contract, caller: from, data, gasLimit: 2_000_000n, block });
  return result.execResult;
}
function revertSelector(execResult) {
  return bytesToHex(execResult.returnValue).slice(0, 10);
}

// 部署：constructor(admin, writer)
const deploy = await evm.runCall({
  data: Buffer.concat([
    Buffer.from(bytecode, "hex"),
    Buffer.from(padAddress(admin).slice(2), "hex"),
    Buffer.from(padAddress(writer).slice(2), "hex"),
  ]),
  caller: admin, gasLimit: 10_000_000n, block,
});
check("合约部署成功", !deploy.execResult.exceptionError, deploy.execResult.exceptionError?.error);
const contract = deploy.createdAddress;

const commitment1 = "0x" + "ab".repeat(32);
const commitment2 = "0x" + "cd".repeat(32);

// T11：非 writer 调用被拒
let r = await call(other, callData(sel.record, commitment1));
check("T11 非 writer 调用被拒(NotWriter)", !!r.exceptionError && revertSelector(r) === err.NotWriter, revertSelector(r));
// T11：零承诺被拒
r = await call(writer, callData(sel.record, "0x" + "00".repeat(32)));
check("T11 零承诺被拒(ZeroCommitment)", !!r.exceptionError && revertSelector(r) === err.ZeroCommitment);
// T12：record 的交易输入只有 selector + 32 字节承诺，不含钱包、签名或关系 ID
const recordData = callData(sel.record, commitment1);
check("T12 交易输入仅 36 字节（无身份数据）", recordData.length === 36);
// 正常登记
r = await call(writer, recordData);
check("T11 writer 正常登记", !r.exceptionError, r.exceptionError?.error);
// 日志为 [address, topics[], data] 元组
const log = r.logs[0];
check("T11 发出 CommitmentRecorded 事件", r.logs.length === 1 && bytesToHex(log[1][1]) === commitment1, r.logs.length);
check("T12 事件 topic 仅承诺哈希(无身份/关系 ID)", log[1].length === 2);
check("T12 事件数据只含时间戳(32 字节)", log[2].length === 32, log[2].length);
check("T12 事件时间戳为区块时间", Buffer.from(log[2]).readBigUInt64BE(24) === 1_791_300_000n);
// recordedAt 读取
r = await call(admin, callData(sel.recordedAt, commitment1));
check("T11 recordedAt 记录区块时间", !r.exceptionError && Buffer.from(r.returnValue).readBigUInt64BE(24) === 1_791_300_000n, bytesToHex(r.returnValue));
// T11：重复登记被拒
r = await call(writer, callData(sel.record, commitment1));
check("T11 重复登记被拒(AlreadyRecorded)", !!r.exceptionError && revertSelector(r) === err.AlreadyRecorded);
// 暂停
r = await call(other, callData(sel.setPaused, "0x01"));
check("T11 非管理员不能暂停", !!r.exceptionError && revertSelector(r) === err.NotAdmin);
r = await call(admin, callData(sel.setPaused, "0x01"));
check("管理员暂停成功", !r.exceptionError);
r = await call(writer, callData(sel.record, commitment2));
check("T11 暂停期间写入被拒(ContractPaused)", !!r.exceptionError && revertSelector(r) === err.ContractPaused);
// writer 轮换
r = await call(admin, callData(sel.rotateWriter, padAddress(other)));
check("轮换 writer 成功", !r.exceptionError);
r = await call(writer, callData(sel.record, commitment2));
check("T11 旧 writer 失效", !!r.exceptionError && revertSelector(r) === err.NotWriter);
r = await call(other, callData(sel.record, commitment2));
check("暂停中新 writer 仍被暂停拦截", !!r.exceptionError && revertSelector(r) === err.ContractPaused);
r = await call(admin, callData(sel.setPaused, "0x00"));
check("解除暂停", !r.exceptionError);
r = await call(other, callData(sel.record, commitment2));
check("T11 新 writer 可登记新承诺", !r.exceptionError);
r = await call(admin, callData(sel.recordedAt, commitment1));
check("T11 历史承诺时间不变（只增不改）", Buffer.from(r.returnValue).readBigUInt64BE(24) === 1_791_300_000n);
// 两步管理员转移
r = await call(other, callData(sel.transferAdmin, padAddress(other)));
check("T11 非管理员不能发起转移", !!r.exceptionError && revertSelector(r) === err.NotAdmin);
r = await call(admin, callData(sel.transferAdmin, padAddress(other)));
check("发起两步转移", !r.exceptionError);
r = await call(writer, callData(sel.acceptAdmin));
check("T11 非候选人 acceptAdmin 被拒", !!r.exceptionError && revertSelector(r) === err.NoPendingAdmin);
r = await call(other, callData(sel.acceptAdmin));
check("T11 候选人接受成为管理员", !r.exceptionError);
r = await call(other, callData(sel.setPaused, "0x00"));
check("新管理员解除暂停", !r.exceptionError);
r = await call(other, callData(sel.record, "0x" + "ef".repeat(32)));
check("解除暂停后新登记成功", !r.exceptionError);

console.log(`\nPASS: ${passed} 项合约行为验证全部通过（本地 EVM 真实执行编译产物；未部署、未发送真实交易）。`);
