import { NextResponse } from "next/server";
export async function POST() {
  // Integration endpoint intentionally fails closed. Never accept demo declarations
  // or user-supplied group roots as a real Semaphore verification result.
  return NextResponse.json({ error: "真实零知识验证器尚未接入", mode: "unconfigured", zkVerified: false }, { status: 501 });
}
