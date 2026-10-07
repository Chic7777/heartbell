// 演示会话：P0 的 viewer 是本地演示身份切换，不是登录认证（计划书 8.3）。
// live 模式下这些入口必须换成服务端可信会话；此处集中声明以便替换。
import { unauthenticated } from "./errors";
import type { V2State } from "../../repositories/demo-repo";

export function resolveDemoUser(state: V2State, viewer: unknown): string {
  if (viewer !== "a" && viewer !== "b") throw unauthenticated("无效演示身份（仅支持 a/b 演示会话）");
  if (!state.users.has(viewer)) throw unauthenticated("演示用户不存在");
  return viewer;
}

export function otherOf(userId: string, members: [string, string]): string {
  return members[0] === userId ? members[1] : members[0];
}
