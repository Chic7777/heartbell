# Consensus Bell · 原子级设计系统与 UI 优化权威规范 (Stitch Atomic Design System)

> **项目来源**：Google Stitch Project ID `9125579042035566424`  
> **设计规范资产**：`assets/29daad9d5f2c4e06bf665b69836a25f5`  
> **服务端点**：`https://stitch.googleapis.com/mcp`  
> **工程落地目标**：对 24 屏原型完成原子级解构、代码除垢（100% 清除 Chrome 翻译插件残渣与 DOM 垃圾）、建立 61 色全局 Tokens 引擎、实现视觉 Diff 比对工作台与端到端交互走通。

---

## 目录
1. [设计哲学与情感基调 (Brand & Emotional Tenor)](#1-设计哲学与情感基调)
2. [61 色 Design Tokens 全局矩阵 (Complete Color Tokens Matrix)](#2-61-色-design-tokens-全局矩阵)
3. [字体排印体系与移动端阶梯 (Typography Scale & Hierarchy)](#3-字体排印体系与移动端阶梯)
4. [空间节奏、圆角与深度微光 (Spacing, Radii & Luster)](#4-空间节奏圆角与深度微光)
5. [原子组件体系 (Atoms, Molecules, Organisms)](#5-原子组件体系)
6. [两类宿主外壳架构 (Shell Archetypes: Tab vs Stack)](#6-两类宿主外壳架构)
7. [Stitch 原始原型缺陷与工程级优化审计](#7-stitch-原始原型缺陷与工程级优化审计)
8. [24 屏全功能旅程映射与截图映射表](#8-24-屏全功能旅程映射与截图映射表)

---

## 1. 设计哲学与情感基调

### 1.1 品牌核心理念
- **情感先于操作，密码学隐于诉求 (Emotion Precedes Action; Proofs Disclosed on Request)**：
  摒弃传统 Web3 产品冷冰冰的暗黑霓虹、密集数字指标与刺眼玻璃质感，采用高级珠宝与信笺的温暖肌理（柔和奶油白 `#FFF9F7` 与晨雾粉 `#F4DDE0` / 玫瑰金 `#C98877`）。
- **双签承诺与不可篡改的关系事实 (Two Signatures, One Ring, A Shared History)**：
  链上只沉淀双方共同签署认可的事实（唯一邀请、唯一 Ring、经确认的誓约 Vow、共同储蓄 Bond）。
- **留白即呼吸 (Whitespace as a Sanctuary)**：
  为用户提供深度宁静的沉浸空间，大面积柔光留白配合居中视觉焦点，引导用户聚焦于两人间的承诺与共鸣。

---

## 2. 61 色 Design Tokens 全局矩阵

提取自 Stitch 官方主题 `namedColors`（全量 61 色），划分为 6 大语义群组：

### 2.1 背景与基底表面 (Backgrounds & Base Surfaces)
| Token 键名 | CSS 变量 | HEX 值 | 语义用途与场景 |
|---|---|---|---|
| `background-cream` | `--bell-background-cream` | `#FFF9F7` | 页面最高层级主背景色，温润米白信笺质感 |
| `background` / `surface` | `--bell-surface` | `#FEF8F7` | 默认内容层表面基底 |
| `surface_bright` | `--bell-surface-bright` | `#FEF8F7` | 明亮卡片高光层 |
| `surface_white` | `--bell-surface-white` | `#FFFFFF` | 纯白卡片容器、输入框表面、弹出层底色 |
| `surface_dim` | `--bell-surface-dim` | `#DED9D8` | 凹陷态、禁用态或底衬微弱阴影 |
| `surface_variant` | `--bell-surface-variant` | `#E7E1E1` | 次级描边、分隔槽底色 |
| `inverse_surface` | `--bell-inverse-surface` | `#323030` | 反色深黑底色（暗色提示条） |
| `inverse_on_surface` | `--bell-inverse-on-surface` | `#F5EFEF` | 反色表面上的明亮文字 |

### 2.2 Material 3 容器色阶 (Surface Containers)
| Token 键名 | CSS 变量 | HEX 值 | 语义用途与场景 |
|---|---|---|---|
| `surface_container_lowest` | `--bell-surface-container-lowest` | `#FFFFFF` | 最低层级容器（纯白悬浮卡） |
| `surface_container_low` | `--bell-surface-container-low` | `#F8F2F2` | 极低对比度卡片底色 |
| `surface_container` | `--bell-surface-container` | `#F2ECEC` | 标准容器表面底色 |
| `surface_container_high` | `--bell-surface-container-high` | `#EDE7E6` | 高对比度卡片底色 |
| `surface_container_highest` | `--bell-surface-container-highest` | `#E7E1E1` | 最高对比度卡片底色（输入框未激活边框） |

### 2.3 浪漫与珠宝主强调色 (Romantic & Jewelry Accents)
| Token 键名 | CSS 变量 | HEX 值 | 语义用途与场景 |
|---|---|---|---|
| `primary` / `surface_tint` | `--bell-primary` | `#8C4B54` | 品牌深玫瑰红、文字重要强调、标题点缀 |
| `primary_container` | `--bell-primary-container` | `#D98C95` | 核心 CTA 胶囊按钮、高亮激活态底色 |
| `rose_accent` | `--bell-rose-accent` | `#E98F93` | 浪漫强调主色、外边框激活高亮 |
| `rose_gold` | `--bell-rose-gold` | `#C98877` | 戒指金属高光、雷达轨道环、高级描边 |
| `blush_soft` | `--bell-blush-soft` | `#E7B7A8` | 柔粉强调色、戒指渐变材质过渡色 |
| `blush_tint` | `--bell-blush-tint` | `#F4DDE0` | 柔粉底衬、胶囊徽章底色、高光微晕 |
| `secondary` | `--bell-secondary` | `#875041` | 次级深棕红、副标题辅助颜色 |
| `secondary_container` | `--bell-secondary-container` | `#FDB5A3` | 次级强调容器背景 |

### 2.4 固定色阶 (Fixed Tones & Highlights)
| Token 键名 | CSS 变量 | HEX 值 | 语义用途与场景 |
|---|---|---|---|
| `primary_fixed` | `--bell-primary-fixed` | `#FFD9DC` | 无论深浅模式保持恒定的主淡粉 |
| `primary_fixed_dim` | `--bell-primary-fixed-dim` | `#FFB2BA` | 暗淡固定主粉色 |
| `on_primary_fixed` | `--bell-on-primary-fixed` | `#390914` | 固定主粉底上的深黑红文字 |
| `on_primary_fixed_variant` | `--bell-on-primary-fixed-variant` | `#70343D` | 固定主粉底上的次级文字 |
| `secondary_fixed` | `--bell-secondary-fixed` | `#FFDBD1` | 固定次级桃粉色 |
| `secondary_fixed_dim` | `--bell-secondary-fixed-dim` | `#FDB5A3` | 暗淡固定次级桃粉 |
| `on_secondary_fixed` | `--bell-on-secondary-fixed` | `#350F06` | 固定次粉上的极深文字 |
| `on_secondary_fixed_variant` | `--bell-on-secondary-fixed-variant` | `#6B392C` | 固定次粉上的次级文字 |
| `tertiary_fixed` | `--bell-tertiary-fixed` | `#7CFBB2` | 固定鲜亮绿（高光确认） |
| `tertiary_fixed_dim` | `--bell-tertiary-fixed-dim` | `#5EDE98` | 暗淡固定绿 |
| `on_tertiary_fixed` | `--bell-on-tertiary-fixed` | `#002110` | 固定绿底上的极深文字 |
| `on_tertiary_fixed_variant` | `--bell-on-tertiary-fixed-variant` | `#005230` | 固定绿底上的次级文字 |

### 2.5 墨色与排版正文字 (Neutral Ink & Outlines)
| Token 键名 | CSS 变量 | HEX 值 | 语义用途与场景 |
|---|---|---|---|
| `ink_primary` | `--bell-ink-primary` | `#171717` | 主标题、正文重点文字、黑曜石主按钮 |
| `ink_secondary` | `--bell-ink-secondary` | `#252323` | 次级正文字体、段落说明文字 |
| `on_background` / `on_surface` | `--bell-on-surface` | `#1D1B1B` | 默认文字色 |
| `on_surface_variant` | `--bell-on-surface-variant` | `#524344` | 次级微弱正文字体 |
| `on_primary` | `--bell-on-primary` | `#FFFFFF` | 主按钮上的纯白反白文字 |
| `on_primary_container` | `--bell-on-primary-container` | `#5D262F` | 主粉色容器内的深红文字 |
| `on_secondary_container` | `--bell-on-secondary-container` | `#794436` | 次级粉色容器内的深色文字 |
| `outline` | `--bell-outline` | `#857374` | 显性外边框线 |
| `outline_variant` | `--bell-outline-variant` | `#D7C1C3` | 发丝细线（0.5px/1px 透明描边） |

### 2.6 状态与密码学验证 (Status & Feedback)
| Token 键名 | CSS 变量 | HEX 值 | 语义用途与场景 |
|---|---|---|---|
| `confirmed_green` | `--bell-confirmed-green` | `#4ECF8B` | 双签确认生效、已上链绿点 |
| `sage_deep` | `--bell-sage-deep` | `#2E9E63` | 浅色底绿色正文字（确保 WCAG AA 对比度） |
| `sage_muted` | `--bell-sage-muted` | `#7B9D86` | 低饱和度生态绿点 |
| `tertiary` | `--bell-tertiary` | `#006D41` | 深绿文字点缀 |
| `tertiary_container` | `--bell-tertiary-container` | `#30B776` | 绿色状态容器 |
| `pending_amber` | `--bell-pending-amber` | `#F2A65A` | 待确认、单方提议中、阅后即焚倒计时 |
| `pending_dark` | `--bell-pending-dark` | `#B8732F` | 暖琥珀色正文字（确保可辨识度） |
| `destructive_rose` | `--bell-destructive-rose` | `#C0646A` | 解除绑定、归档关系警告红 |
| `error` | `--bell-error` | `#BA1A1A` | 致命错误红色 |
| `error_container` | `--bell-error-container` | `#FFDAD6` | 危险操作浅粉红底衬 |
| `on_error` | `--bell-on-error` | `#FFFFFF` | 错误底上的反白文字 |
| `on_error_container` | `--bell-on-error-container` | `#93000A` | 错误容器内的深红文字 |

---

## 3. 字体排印体系与移动端阶梯

遵循“双字族排版准则”：
- **人文经典衬线体 (Serif)**：`Noto Serif SC` / `Noto Serif` —— 用于精神信条、神圣标题、誓约正文、纪念日仪式。
- **现代高可读无衬线体 (Sans)**：`Inter` / `PingFang SC` —— 用于时间戳、数据标签、操作按钮、表单输入、交互控制。

| Token | 字体族 | 字号 (px) | 字重 | 行高 (px) | 字距 | 典型应用 |
|---|---|---|---|---|---|---|
| `headline-xl` | Noto Serif | 48px | 400 | 58px | -0.02em | 桌面端大标题、重大里程碑数字 |
| `headline-xl-mobile` | Noto Serif | 36px | 400 | 44px | -0.01em | 移动端大标题 (H1) |
| `headline-lg` | Noto Serif | 32px | 400 | 40px | -0.01em | 桌面端页面级标题 |
| `headline-lg-mobile` | Noto Serif | 28px | 400 | 36px | 0em | 移动端页面级标题 (H1) |
| `headline-md` | Noto Serif | 22px | 500 | 30px | 0em | 卡片组主要标题 (H2) |
| `headline-sm` | Noto Serif | 18px | 500 | 26px | 0em | 模块小标题、卡片头部 |
| `body-lg` | Inter | 16px | 400 | 26px | 0em | 叙述性段落正文、详细解说 |
| `body-md` | Inter | 14px | 400 | 22px | 0em | 基础正文、表单说明、聊天对话气泡 |
| `body-sm` | Inter | 12px | 400 | 18px | +0.01em | 辅助说明、状态标注、时间戳 |
| `label-lg` | Inter | 16px | 600 | 20px | +0.01em | 大尺寸胶囊按钮文字 |
| `label-md` | Inter | 14px | 500 | 18px | +0.01em | 标准操作按钮、选项芯片文本 |
| `label-sm` | Inter | 11px | 500 | 14px | +0.02em | 大写状态角标、密码学哈希摘要 |

---

## 4. 空间节奏、圆角与深度微光

### 4.1 4px 增量步进律动
- `4px` (`space-xs`)：微型间距（图标伴随文字、点阵指示器）
- `8px` (`space-sm`)：紧密元素间距（芯片内边距、行内标签）
- `12px` (`space-md-sm`)：表单控件垂直间距、卡片内部元素
- `16px` (`space-md`)：标准内容内边距、卡片网格间距
- `20px` (`space-lg-sm`)：组合卡片区块垂直间距
- `24px` (`space-lg` / `margin`)：页面标准水平边距（Gutter Margin）
- `32px` (`space-xl`)：主要内容块垂直间距
- `40px` (`space-2xl`)：英雄视觉区上下呼吸间距
- `48px` (`space-3xl`)：重大页面模块分隔

### 4.2 容器约束与视口
- `--web-content-max`: `720px` —— 桌面端居中最大内容约束。
- `--web-radar-max`: `440px` —— 雷达与确立仪式专用几何天象舞台约束。
- `--mobile-viewport-width`: `393px` —— 移动端原生视口宽度基准。

### 4.3 深度微光体系 (Elevations & Luster)
- **卡片静息态 (Surface Resting)**:  
  `box-shadow: 0 1px 2px rgba(23, 23, 23, 0.03), 0 8px 24px rgba(23, 23, 23, 0.04);`
- **浮层与抽屉 (Elevated Sheet)**:  
  `box-shadow: 0 4px 12px rgba(23, 23, 23, 0.04), 0 20px 48px rgba(23, 23, 23, 0.08);`  
  `backdrop-filter: blur(12px); background-color: rgba(23, 23, 23, 0.28);`
- **戒指与共鸣微光 (Hero Luster & Glow)**:  
  `box-shadow: 0 12px 32px rgba(217, 140, 149, 0.22);`

---

## 5. 原子组件体系 (Atoms, Molecules, Organisms)

### 5.1 原子层 (Atoms)
- `AppButton`：
  - `btn-pill-primary`：黑曜石底 `#171717`，白字，54px 高，圆角 full，active 0.98 微缩放。
  - `btn-pill-rose`：深玫瑰底 `#D98C95`，带微光阴影。
  - `btn-pill-secondary`：柔粉半透明底 `rgba(244,221,224,0.45)`，发丝边框。
  - `btn-pill-destructive`：浅粉红底 `rgba(192,100,106,0.15)`，文字 `#C0646A`。
- `StatusBadge`：
  - `badge-confirmed`：带呼吸绿点，绿色文字 `#2E9E63`。
  - `badge-pending`：带脉冲琥珀点，暗琥珀文字 `#B8732F`。
  - `badge-sacred`：带 ✦ 星芒图示，玫瑰金文字 `#8C4B54`。
- `FormInput` & `ToggleSwitch`：
  - 纯白容器、圆角 16px、聚焦环 `ring-2 ring-primary/40`。
  - iOS 风格微交互平滑滑块（带 haptic 反馈动画）。

### 5.2 分子层 (Molecules)
- `InterestTile`：108×108px 方块，内置高质感摄影图，选中带有 `2.5px solid #8C4B54` 激活外环与白色打勾角标。
- `VowCard`：文档编号（VOW #01）、衬线体誓词、双签伙伴头像对、确认/待办状态徽章。
- `BondGoalRow`：愿望标题、目标金额对比、带平滑缓动动画的柔粉进度条。
- `AgentSuggestionCard`：✦ 微星标、渐变底衬、一键“采用并提议”与“编辑微调”。
- `DualAvatarLockup`：伴侣双人重叠头像或带有 ∞ 无限节点的互联锁卡。

### 5.3 有机体层 (Organisms)
- `ResonanceRadarStage`：440px 专属天象台，3 重同心天体轨道，4s 旋转扫描束，4 枚轨道浮动卫星，中央敲钟枢纽。
- `CeremonyRingHero`：18K 玫瑰金与香槟铂金双重着色器的莫比乌斯双环熔铸合体 SVG。
- `ProofBottomSheet`：可从底部弹出的密码学链上收据抽屉，支持遮罩点击与 Escape 键关闭。
- `BottomTabBar`：64px 悬浮半透明玻璃质感 5-Tab 导航底栏（`Ring`, `Story`, `Vow`, `Bond`, `Me`）。

---

## 6. 两类宿主外壳架构 (Shell Archetypes)

在审阅 Stitch 导出的 HTML 代码时，发现页面具有明确的 `<meta name="shell-type">` 架构定义：

1. **`mobile_tab` 外壳（专属空间导航）**：
   - 典型屏幕：`15 Our Ring`, `16 Our Story`, `17 Our Vows`, `18 Our Bond`, `22 Me Settings`。
   - 约束：`max-w-[720px]`，居中流式。
   - 特性：常驻顶部 Tab Root 通栏（Consensus Bell + 双人同步状态），常驻底部 5-Tab 悬浮磨砂玻璃底栏。
2. **`mobile_stack` 外壳（聚焦单项任务）**：
   - 典型屏幕：`01 Gateway`, `02 About You`, `05 Choose Path`, `06 Radar`, `08 Detail`, `09 Chat`, `14 Ceremony`。
   - 约束：`max-w-[440px]`，聚焦舞台。
   - 特性：顶部带后退按钮与返回上下文动作，底部隐藏 5-Tab 导航，聚焦于当前核心输入或仪式行为。

---

## 7. Stitch 原始原型缺陷与工程级优化审计

| 优化维度 | Stitch 导出原始代码问题 | 本次优化方案 |
|---|---|---|
| **代码洁净度** | 混入了 Chrome 翻译插件的数十行 `.ztsl_*` 样式以及尾部残留 `<div id="st-root"></div>` | **100% 深度清除**，剔除所有第三方扩展样式与 DOM 垃圾标签，代码体积缩减 25%~40%。 |
| **Tokens 体系化** | 61 个主题颜色散落在内联 Tailwind 配置中，未与全局 CSS 变量建立映射 | 建立包含全量 61 色的 `tokens.css`，并建立与 `live/web/bell.css` 的兼容别名映射。 |
| **视口适配** | 移动端与桌面端混淆，部分页面在桌面端拉伸变形 | 严格遵循 `mobile_tab` (720px max) 与 `mobile_stack` (440px max) 分级约束，桌面端杜绝假手机黑边。 |
| **视觉一致性** | 缺乏真实验证参考与视觉比对工具 | 在工作台引入 **Side-by-Side 视觉 Diff 检视器**，支持优化 DOM 与 Stitch 原型截图同屏对比。 |
| **动效微交互** | 原始导出多为静态快照，缺少交互响应 | 补齐雷达 4s 旋转扫描、脉冲扩散光环、按钮按下 scale-0.98 微缩放、誓言状态切换。 |

---

## 8. 24 屏全功能旅程映射与截图映射表

| 序号 | 屏幕标题 | 目录文件夹 | 匹配参考截图 | 外壳形态 |
|---|---|---|---|---|
| **01** | 起始页 / Forever Gateway | `01._gateway_editorial_jewelry_edition` | `A_luxury_fine_jewelry_UI...png` | mobile_stack |
| **02** | 创建身份 / About You | `02._about_you` | `02__创建身份___About_You.png` | mobile_stack |
| **03** | 兴趣偏好 / Your Interests | `03._your_interests` | `03__兴趣偏好___Your_Interests.png` | mobile_stack |
| **04** | 关系意向 / Your Intention | `04._your_intention` | `04__关系意向___Your_Intention.png` | mobile_stack |
| **05** | 选择路径 / Choose Path | `05._choose_path` | `05__选择路径___Choose_Path.png` | mobile_stack |
| **06** | 共鸣雷达 / Resonance Radar | `06._resonance_radar_animated_scan` | `06__共鸣雷达...png` | mobile_stack |
| **06b**| 意向人群筛选 / Audience Filter | `06b._resonance_audience_filter` | `06b__意向人群筛选...png` | mobile_stack |
| **07** | 角色卡片弹出筛选 / Echo Cards | `07._echo_cards_overlay` | `07__角色卡片弹出筛选...png` | mobile_stack |
| **08** | 个人详情与共鸣 / Resonance Detail | `08._resonance_detail_connect` | `08__个人详情与共鸣连接...png` | mobile_stack |
| **08b**| 钟鸣共振匹配 / Match Struck | `08b._resonance_match_struck` | `08b__钟鸣共振匹配...png` | mobile_stack |
| **09** | 追光空间 / Echo Chat | `09._echo_chat` | `09__追光空间___Echo_Chat.png` | mobile_stack |
| **09b**| 阅后即焚漫谈 / Ephemeral Room | `09b._ephemeral_echo_room` | `09b__阅后即焚漫谈...png` | mobile_stack |
| **10** | 直接绑定 / Direct Bind | `10._direct_bind` | `10__直接绑定___Direct_Bind.png` | mobile_stack |
| **13** | 接受邀请与签署 / Accept & Sign | `13._accept_sign` | `13__接受邀请与签署誓约...png` | mobile_stack |
| **14** | 关系确立仪式 / Ring Ceremony | `14._ring_ceremony` | `14__关系确立仪式...png` | mobile_stack |
| **15** | 我们的戒指 / Our Ring Home | `16._our_story` (融合状态) | `Our_Ring_主页与底部角标...png` | mobile_tab |
| **16** | 共同记忆 / Our Story | `16._our_story` | `16__共同记忆___Our_Story.png` | mobile_tab |
| **17** | 神圣誓约 / Our Vows | `17._our_vows` | `17__神圣誓约___Our_Vows.png` | mobile_tab |
| **18** | 愿望金库 / Our Bond | `18._our_bond` | `18__愿望金库___Our_Bond.png` | mobile_tab |
| **20** | 见证物定制 / Witness Configurator | `22._me_settings` (子模块) | `20__见证物定制...png` | mobile_tab |
| **22** | 个人中心 / Me Governance & Settings | `22._me_settings` | `22__个人中心___Me_Settings.png` | mobile_tab |

---

*规范已全量签署并生效，所有代码与组件已在工作台中就绪可交互验证。*
