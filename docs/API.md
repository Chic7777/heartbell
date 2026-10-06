# 数据与接口约定

共享类型：`src/lib/types.ts`。修改字段前与前后端负责人协调。

## 已提供的开发接口

`GET /api/demo?viewer=a`（或 b）返回 `{ mode: "mock", data: { self, nearby, bells, profile, eligibility, memory } }`。

- self：自己的雷达状态。
- nearby：双方雷达开启时返回另一位用户的临时特征，不含长期资料。
- bells：涉及自己的铃声。
- profile：双方回响后返回对方档案，否则为 null。权限检查在服务器端执行。
- eligibility：模拟声明状态；zkVerified 始终为 false。
- memory：回响后可见的共同纪念，transactionHash 始终为 null（模拟不产生交易）。

`POST /api/demo` 请求体：

```json
{"viewer":"a","action":"radar","active":true,"traits":[{"category":"穿着","value":"绿色卫衣"},{"category":"手持物","value":"篮球"}]}
```

```json
{"viewer":"a","action":"ring","message":"想一起喝杯咖啡。"}
```

```json
{"viewer":"b","action":"respond","bellId":"实际铃声ID","status":"accepted"}
```

回应状态还支持 dismissed。成功返回 `{ mode: "mock", data: { ok: true } }`；错误返回 `{ error: "说明" }` 和 400/409 状态码。

类别只允许：穿着、配饰、手持物、当前状态、其他。共两到三项，每项内容 1–20 字。

新增 POST 操作：

| action | 额外字段 | 含义 |
|---|---|---|
| declare | single: true | 模拟单身声明，不生成真实证明 |
| memory-create | 无 | 回响后建立一份不可编辑的演示纪念 |
| memory-consent | 无 | 当前演示用户确认内容 |
| memory-simulate | 无 | 双方确认后完成预览，不发送交易 |

未声明不能摇铃（403）；未回响不能创建纪念（403）；只有单方确认不能完成纪念（409）。

`POST /api/eligibility` 是真实证明验证预留入口，当前始终返回 501、mode=unconfigured、zkVerified=false。正式接入后需按 docs/WEB3.md 校验可信根和防重放，不能把模拟声明作为成功证明。

## 使用边界

这是两用户本地演示接口。viewer 是可手动指定的演示身份，不是登录认证。内存状态只适用于单进程，不适用于多实例或 serverless 持久化。前端每 1.2 秒轮询，尚未接入 Supabase 实时订阅。

## 后续正式接口任务

- 从可信登录会话取得用户身份，禁止信任请求中的 viewer。
- 使用数据库和实时订阅，处理雷达过期及临时特征清理。
- 拒绝状态对发送者映射为消散，不暴露明确拒绝记录。
- 联系方式增加独立的双向同意记录，未同意不得返回。
- 正式纪念采用双方分别调用合约 approveMemory 的方案（两次交易），钱包签署交易代表确认。需核验链上双方批准状态；模拟确认不作为链上授权。
- ZK 验证真实资格证明、限定重复信号范围，关系变化后更新资格并拒绝旧证明。
