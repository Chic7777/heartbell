// V2 承诺计算协议（计划书 9.3 节）：RFC 8785 风格 JCS 规范化 + SHA-256 带独立随机秘密的内容承诺。
// 仅服务端使用；salt 永不写入公开链。旧合约的 keccak256 纪念 ID 属于 V1，不与本协议混用。
import { createHash, randomBytes } from "node:crypto";

// JCS：对象键按 UTF-16 码单元升序排序后序列化。本产品 payload 只含受控的
// 字符串（无孤立代理项）、整数和 null/数组/对象，JSON.stringify 的原语序列化
// 与 RFC 8785 一致；此处显式拒绝浮点与非有限数，保证两端字节一致。
export function canonicalizeJson(value: unknown): string {
  return serialize(value, "");
}

function serialize(value: unknown, path: string): string {
  if (value === null || typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number") {
    if (!Number.isInteger(value)) throw new Error(`JCS 拒绝非整数数字（${path}）`);
    return JSON.stringify(value);
  }
  if (typeof value === "boolean") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((item, i) => serialize(item, `${path}[${i}]`)).join(",")}]`;
  if (typeof value === "object") {
    const keys = Object.keys(value as Record<string, unknown>).sort();
    const parts = keys.map(key => `${JSON.stringify(key)}:${serialize((value as Record<string, unknown>)[key], `${path}.${key}`)}`);
    return `{${parts.join(",")}}`;
  }
  throw new Error(`JCS 拒绝 unsupported value at ${path}`);
}

const DOMAIN_PREFIX = "HEARTBELL_V2"; // 与 0x00 一起作为域分隔字节串
export const V2_SCHEMA = "heartbell.record.v2";

export interface CommitmentPayload {
  schema: typeof V2_SCHEMA;
  recordType: string;
  recordId: string;
  version: number;
  relationshipId: string | null;
  businessOccurredAt: string; // ISO 8601
  previousVersionCommitment: string | null;
  participants: string[];
  content: unknown;
  attachmentHashes: string[];
  rulesVersion: string;
}

export interface CommitmentMaterial {
  payloadJson: string;   // JCS 规范化后的 payload 字符串（私有证据）
  salt: string;          // 32 字节 hex，独立随机秘密
  commitment: string;    // 0x + 64 hex
  contentDigest: string; // 0x + 64 hex
}

export function newSalt(): string {
  return "0x" + randomBytes(32).toString("hex");
}

// commitment = SHA256( UTF8("HEARTBELL_V2" || 0x00) || salt(32B) || contentDigest(32B) )
// 字节串拼接，不是十六进制文本；salt 与 digest 固定 32 字节，避免拼接歧义。
export function computeCommitment(payload: CommitmentPayload, salt: string): CommitmentMaterial {
  const payloadJson = canonicalizeJson(payload);
  const digest = createHash("sha256").update(payloadJson, "utf8").digest();
  const saltBytes = Buffer.from(salt.slice(2), "hex");
  if (saltBytes.length !== 32) throw new Error("salt 必须为 32 字节");
  const prefix = Buffer.concat([Buffer.from(DOMAIN_PREFIX, "utf8"), Buffer.from([0])]);
  const commitment = createHash("sha256").update(Buffer.concat([prefix, saltBytes, digest])).digest("hex");
  return {
    payloadJson,
    salt,
    contentDigest: "0x" + digest.toString("hex"),
    commitment: "0x" + commitment,
  };
}

export function buildPayload(base: Omit<CommitmentPayload, "schema">): CommitmentPayload {
  return { schema: V2_SCHEMA, ...base };
}
