# 数据与接口约定

共享类型：`src/lib/types.ts`。修改字段前与前后端负责人协调。

## 已提供的开发接口

`GET /api/demo?viewer=a`（或 b）返回 `{ mode: "mock", data: { self, nearby, bells, profile, eligibility, diaries, wallets } }`。

- self：自己的雷达状态。
- nearby：双方雷达开启时返回另一位用户的临时特征，不含长期资料。
- bells：涉及自己的铃声。
- profile：双方回响后返回对方档案，否则为 null。权限检查在服务器端执行。
- eligibility：模拟声明状态；zkVerified 始终为 false。
- diaries：回响后可见的情侣日记数组，否则为空数组。每页包含 kind、date、title、message、author、contentHash、status（awaiting-consent / ready / rejected）、consent 与 chain（双方确认交易哈希及完成时间，来自前端回报）。
- wallets：回响后返回双方绑定的演示钱包地址（小写），未绑定为 null。仅用于组装上链参数，不是登录认证。

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
| diary-create | kind, date, title, message | 回响后写一页日记；作者自动确认，等待对方 |
| diary-consent | diaryId | 当前演示用户确认这一页；双方确认后 status=ready |
| diary-reject | diaryId | 对方婉拒这一页，status=rejected，不上链 |
| wallet-bind | address | 绑定当前演示用户的钱包地址（0x + 40 位十六进制），仅演示记录 |
| diary-onchain | diaryId, txHash | 前端真实钱包交易成功后回报交易哈希；双方都回报后记录完成时间 |

日记校验：kind 限 first-echo / anniversary / trip / ordinary-day / promise；date 为不晚于今天的 YYYY-MM-DD；标题 1–20 字、一句话 1–60 字（trim 后）。contentHash 为服务端按内容生成的 SHA-256 指纹，包含随机 id，客户端不可指定。

未声明不能摇铃（403）；未回响不能写日记（403）；单人确认不能回报上链（409）；同一用户对同一页重复回报被拒（409）。演示服务不连接链上节点，diary-onchain 只做哈希格式校验（0x + 64 位十六进制），无法独立证明交易真实发生；正式版应由后端按交易回执核验后再入库。

`POST /api/eligibility` 是真实证明验证预留入口，当前始终返回 501、mode=unconfigured、zkVerified=false。正式接入后需按 docs/WEB3.md 校验可信根和防重放，不能把模拟声明作为成功证明。

## 使用边界

这是两用户本地演示接口。viewer 是可手动指定的演示身份，不是登录认证。内存状态只适用于单进程，不适用于多实例或 serverless 持久化。前端每 1.2 秒轮询，尚未接入 Supabase 实时订阅。

## 后续正式接口任务

- 从可信登录会话取得用户身份，禁止信任请求中的 viewer。
- 使用数据库和实时订阅，处理雷达过期及临时特征清理。
- 拒绝状态对发送者映射为消散，不暴露明确拒绝记录。
- 联系方式增加独立的双向同意记录，未同意不得返回。
- 情侣日记已采用双方分别调用合约 approveMemory 的方案（两次交易），钱包签署交易代表确认。正式版需由后端核验链上双方批准状态与交易回执后再入库；演示回报不能替代链上核验。日记按内容指纹存证，钱包地址、双方关联和时间仍然公开，隐私方案见团队《关系上链隐私与退出机制研究》。
- ZK 验证真实资格证明、限定重复信号范围，关系变化后更新资格并拒绝旧证明。
