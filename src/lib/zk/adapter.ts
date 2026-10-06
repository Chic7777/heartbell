export interface EligibilityProof {
  protocol: "semaphore-v4";
  groupRoot: string;
  scope: string;
  message: string;
  nullifier: string;
  proof: unknown;
}
export interface EligibilityVerifier {
  verify(input: EligibilityProof, expected: { groupRoot: string; scope: string; message: string }): Promise<boolean>;
}

// Fail closed until a real Semaphore verifier and trusted group registry are integrated.
// Never accept a client-provided root or claim as proof of eligibility.
export const unconfiguredVerifier: EligibilityVerifier = {
  async verify() { throw new Error("真实 ZK 验证器尚未配置；演示声明不能作为零知识证明。"); },
};
