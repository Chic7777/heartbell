import { NextResponse } from "next/server";
import { getState, getRevealedProfile, isUserId } from "../../../lib/mock/store";
import type { UserId } from "../../../lib/types";
import { createHash } from "node:crypto";
export const dynamic = "force-dynamic";
const messages = ["想认识你。", "想和你聊一聊。", "想一起喝杯咖啡。"];
export async function GET(request: Request) {
  const viewer = new URL(request.url).searchParams.get("viewer");
  if (!isUserId(viewer)) return NextResponse.json({ error: "无效演示身份" }, { status: 400 });
  const state = getState();
  const other = viewer === "a" ? "b" : "a";
  return NextResponse.json({ mode: "mock", data: {
    self: state.users[viewer],
    nearby: state.users[viewer].radar.active && state.users[other].radar.active ? [state.users[other]] : [],
    bells: state.bells.filter(b => b.from === viewer || b.to === viewer),
    profile: getRevealedProfile(viewer, other),
    eligibility: { declared: state.eligibility[viewer], mode: "simulation", zkVerified: false },
    memory: getRevealedProfile(viewer, other) ? state.memory : null,
  } }, { headers: { "Cache-Control": "no-store" } });
}
export async function POST(request: Request) {
  let body;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "无效 JSON" }, { status: 400 }); }
  if (!body || typeof body !== "object" || Array.isArray(body)) return NextResponse.json({ error: "请求必须为对象" }, { status: 400 });
  if (!isUserId(body.viewer)) return NextResponse.json({ error: "无效演示身份" }, { status: 400 });
  const state = getState();
  const viewer: UserId = body.viewer;
  const other = viewer === "a" ? "b" : "a";
  if (body.action === "declare") {
    if (body.single !== true) return NextResponse.json({ error: "需要主动作出单身声明" }, { status: 400 });
    state.eligibility[viewer] = true;
  } else if (body.action === "radar") {
    if (typeof body.active !== "boolean" || !Array.isArray(body.traits) || body.traits.length < 2 || body.traits.length > 3 || !body.traits.every((t: unknown) => {
      if (!t || typeof t !== "object") return false;
      const trait = t as { category?: unknown; value?: unknown };
      return ["穿着", "配饰", "手持物", "当前状态", "其他"].includes(String(trait.category)) && typeof trait.value === "string" && trait.value.trim().length > 0 && trait.value.length <= 20;
    })) {
      return NextResponse.json({ error: "请选择两到三个有效特征" }, { status: 400 });
    }
    state.users[viewer].radar = { active: body.active, traits: body.traits, zone: "wuhan-demo", expiresAt: body.active ? Date.now() + 600_000 : null };
  } else if (body.action === "ring") {
    if (!state.eligibility[viewer]) return NextResponse.json({ error: "请先完成模拟资格声明" }, { status: 403 });
    if (!state.users[viewer].radar.active || !state.users[other].radar.active) return NextResponse.json({ error: "双方需要开启雷达" }, { status: 409 });
    if (!messages.includes(body.message)) return NextResponse.json({ error: "请选择预设铃声" }, { status: 400 });
    if (state.bells.some(b => b.from === viewer && b.to === other && b.createdAt >= (state.users[other].radar.expiresAt! - 600_000))) return NextResponse.json({ error: "本轮已经摇过铃了" }, { status: 409 });
    state.bells.push({ id: crypto.randomUUID(), from: viewer, to: other, message: body.message, status: "pending", createdAt: Date.now() });
  } else if (body.action === "respond") {
    const bell = state.bells.find(b => b.id === body.bellId && b.to === viewer && b.status === "pending");
    if (!bell || !["accepted", "dismissed"].includes(body.status)) return NextResponse.json({ error: "铃声不存在或已经处理" }, { status: 409 });
    bell.status = body.status;
  } else if (body.action === "memory-create" || body.action === "memory-consent" || body.action === "memory-simulate") {
    if (!getRevealedProfile(viewer, other)) return NextResponse.json({ error: "双方回响后才能创建纪念" }, { status: 403 });
    if (body.action === "memory-create") {
      if (state.memory) return NextResponse.json({ error: "演示纪念已经创建" }, { status: 409 });
      const id = crypto.randomUUID();
      const createdAt = Date.now();
      const title = "第一次回响";
      const contentHash = "0x" + createHash("sha256").update(JSON.stringify({ id, createdAt, title })).digest("hex");
      state.memory = { id, createdAt, title, contentHash, status: "awaiting-consent", consent: { a: false, b: false }, transactionHash: null };
    } else {
      const memory = state.memory;
      if (!memory) return NextResponse.json({ error: "请先创建纪念" }, { status: 409 });
      if (body.action === "memory-consent") {
        if (memory.status === "simulated") return NextResponse.json({ error: "模拟纪念已完成" }, { status: 409 });
        memory.consent[viewer] = true;
        if (memory.consent.a && memory.consent.b) memory.status = "ready";
      } else {
        if (!memory.consent.a || !memory.consent.b) return NextResponse.json({ error: "需要双方确认相同纪念" }, { status: 409 });
        memory.status = "simulated";
      }
    }
  } else return NextResponse.json({ error: "未知操作" }, { status: 400 });
  return NextResponse.json({ mode: "mock", data: { ok: true } });
}
