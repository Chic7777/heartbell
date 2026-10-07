// 统一 API 错误（计划书 10.3 节错误码）。
export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public retryable = false,
  ) { super(message); }
}
export const badRequest = (message: string) => new ApiError(400, "BAD_REQUEST", message);
export const unauthenticated = (message = "需要有效的演示会话") => new ApiError(401, "UNAUTHENTICATED", message);
export const forbidden = (message: string) => new ApiError(403, "FORBIDDEN", message);
export const notFound = (message = "记录不存在") => new ApiError(404, "NOT_FOUND", message);
export const conflict = (code: string, message: string) => new ApiError(409, code, message);
export const versionConflict = (message = "内容已更新，请重新阅读最新版本") =>
  new ApiError(409, "VERSION_CONFLICT", message);
export const consentRequired = (message: string) => new ApiError(403, "CONSENT_REQUIRED", message);
export const chainUnavailable = (message: string) => new ApiError(503, "CHAIN_UNAVAILABLE", message, true);
