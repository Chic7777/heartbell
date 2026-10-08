import json
import os

with open(r'c:\Users\llwxy\Downloads\keyanglove\stitch_design_system\design_system_full.json', 'r', encoding='utf-8') as f:
    ds_json = json.load(f)

theme = ds_json['designSystems'][0]['designSystem']['theme']
named_colors = theme['namedColors']

# Categorize the 61 colors
color_categories = {
    "Backgrounds & Surfaces": [
        "background-cream", "background", "surface", "surface-bright", "surface-white",
        "surface-dim", "surface-variant", "inverse-surface", "inverse-on-surface"
    ],
    "Material 3 Surface Containers": [
        "surface_container_lowest", "surface_container_low", "surface_container",
        "surface_container_high", "surface_container_highest"
    ],
    "Romantic & Jewelry Accents": [
        "primary", "primary-container", "surface-tint", "rose-accent", "rose-gold",
        "blush-soft", "blush-tint", "secondary", "secondary-container"
    ],
    "Fixed Tones & Highlights": [
        "primary-fixed", "primary-fixed-dim", "on-primary-fixed", "on-primary-fixed-variant",
        "secondary-fixed", "secondary-fixed-dim", "on-secondary-fixed", "on-secondary-fixed-variant",
        "tertiary-fixed", "tertiary-fixed-dim", "on-tertiary-fixed", "on-tertiary-fixed-variant"
    ],
    "Neutral Ink & Outlines": [
        "ink-primary", "ink-secondary", "on-background", "on-surface", "on-surface-variant",
        "on-primary", "on-primary-container", "on-secondary", "on-secondary-container",
        "on-tertiary", "on-tertiary-container", "outline", "outline-variant"
    ],
    "Status & Feedback": [
        "confirmed-green", "sage-deep", "sage-muted", "tertiary", "tertiary-container",
        "pending-amber", "pending-dark", "destructive-rose", "error", "error_container",
        "on-error", "on-error_container"
    ]
}

# Screens catalog with exact mapping to screenshots
screens_catalog = [
    {
        "id": "01",
        "folder": "01._gateway_editorial_jewelry_edition",
        "screenshot": "A_luxury_fine_jewelry_UI_component_asset_for_the_'Consensus_.png",
        "title": "01. 起始页 / Forever Gateway",
        "category": "Phase A · 探索前奏",
        "shell": "mobile_stack (440px max)",
        "desc": "以高级珠宝徽章为核心视觉焦点，双人神圣契约的永恒入口，提供开始旅程与访客预览。",
        "atoms": ["珠宝微光勋章", "黑曜石胶囊按钮", "微量区块链轻触提示", "大写衬线题标"]
    },
    {
        "id": "02",
        "folder": "02._about_you",
        "screenshot": "02__创建身份___About_You.png",
        "title": "02. 创建身份 / About You",
        "category": "Phase A · 身份共鸣",
        "shell": "mobile_stack (440px max)",
        "desc": "第一步基本档案创建：头像单字占位符、昵称、年龄、代词、常驻城市与个人告白。",
        "atoms": ["4 步进度指示器", "柔白圆角输入框", "代词单选芯片", "下一步主按钮"]
    },
    {
        "id": "03",
        "folder": "03._your_interests",
        "screenshot": "03__兴趣偏好___Your_Interests.png",
        "title": "03. 兴趣偏好 / Your Interests",
        "category": "Phase A · 身份共鸣",
        "shell": "mobile_stack (440px max)",
        "desc": "第二步兴趣图谱：摄影、音乐、旅行、美食、阅读等 8 张高质感图块，支持多选高亮微光。",
        "atoms": ["108px 兴趣图像卡", "玫瑰金激活环", "纯白打勾微徽章", "多选计数器"]
    },
    {
        "id": "04",
        "folder": "04._your_intention",
        "screenshot": "04__关系意向___Your_Intention.png",
        "title": "04. 关系意向 / Your Intention",
        "category": "Phase A · 身份共鸣",
        "shell": "mobile_stack (440px max)",
        "desc": "第三步意向选择：灵魂伴侣、慢热恋爱、共鸣对话、终身伴侣等 4 种意向卡片。",
        "atoms": ["意向语义卡", "单选点阵指示器", "浪漫释义段落"]
    },
    {
        "id": "05",
        "folder": "05._choose_path",
        "screenshot": "05__选择路径___Choose_Path.png",
        "title": "05. 选择路径 / Choose Path",
        "category": "Phase A · 路径分流",
        "shell": "mobile_stack (440px max)",
        "desc": "分流选择核心路径：共鸣雷达寻觅灵魂伴侣 vs. 直接绑定已知伴侣公钥地址。",
        "atoms": ["双路径高光卡片", "摄影底图蒙层", "方向指示箭头", "安全验证提示"]
    },
    {
        "id": "06",
        "folder": "06._resonance_radar_animated_scan",
        "screenshot": "06__共鸣雷达___Resonance_Radar_(Animated_Scan).png",
        "title": "06. 共鸣雷达 / Resonance Radar",
        "category": "Phase A · 寻觅共鸣",
        "shell": "mobile_stack (440px max)",
        "desc": "440px 专属雷达天象台：3 重同心玫瑰金天体轨道环，4 枚顺时针轨道卫星与扫描雷达束。",
        "atoms": ["4s 旋转雷达波束", "同心天体环", "卫星浮动节点", "敲钟触发枢轴"]
    },
    {
        "id": "06b",
        "folder": "06b._resonance_audience_filter",
        "screenshot": "06b__意向人群筛选___Resonance_Audience_Filter.png",
        "title": "06b. 意向人群筛选 / Audience Filter",
        "category": "Phase A · 寻觅共鸣",
        "shell": "mobile_stack (440px max)",
        "desc": "多维度筛选抽屉：地理距离滑动条、年龄区间选择、性别与真实身份验证开关。",
        "atoms": ["玫瑰金滑块条", "双向区间芯片", "抽屉顶部拖拽把手", "保存筛选按钮"]
    },
    {
        "id": "07",
        "folder": "07._echo_cards_overlay",
        "screenshot": "07__角色卡片弹出筛选___Echo_Cards_Overlay.png",
        "title": "07. 角色卡片筛选 / Echo Cards",
        "category": "Phase A · 候选推荐",
        "shell": "mobile_stack (440px max)",
        "desc": "雷达探测结果浮层：卡片展示候选人契合点、共同兴趣标签及共振百分比提示。",
        "atoms": ["半透明磨砂卡片", "契合点标签", "保存候选人爱心按钮", "查看详情胶囊"]
    },
    {
        "id": "08",
        "folder": "08._resonance_detail_connect",
        "screenshot": "08__个人详情与共鸣连接___Resonance_Detail_&_Connect.png",
        "title": "08. 个人详情与共鸣 / Resonance Detail",
        "category": "Phase A · 深度链接",
        "shell": "mobile_stack (440px max)",
        "desc": "候选人深度画像：人生宣言、生活切片相册、共同话题推荐及向 Ta 敲钟发起连接。",
        "atoms": ["沉浸式画像卡", "生活碎片图格", "灵感话题卡", "向 Ta 敲钟 CTA"]
    },
    {
        "id": "08b",
        "folder": "08b._resonance_match_struck",
        "screenshot": "08b__钟鸣共振匹配___Resonance_Match_Struck.png",
        "title": "08b. 钟鸣共振匹配 / Match Struck",
        "category": "Phase A · 触动时刻",
        "shell": "mobile_stack (440px max)",
        "desc": "双方互相敲钟后的双向共鸣仪式庆典弹窗：双环共振、星芒闪烁、一键进入追光空间。",
        "atoms": ["双环旋转微光动效", "庆典星芒粒子", "进入追光空间主按钮", "稍后再聊次级按钮"]
    },
    {
        "id": "09",
        "folder": "09._echo_chat",
        "screenshot": "09__追光空间___Echo_Chat.png",
        "title": "09. 追光空间 / Echo Chat",
        "category": "Phase A · 亲密沟通",
        "shell": "mobile_stack (440px max)",
        "desc": "端到端加密亲密漫谈空间：气泡对话、时间戳、密码学证明展开与顶部状态条。",
        "atoms": ["私密聊天气泡", "顶部双人共鸣徽章", "阅后即焚开关", "发送输入条"]
    },
    {
        "id": "09b",
        "folder": "09b._ephemeral_echo_room",
        "screenshot": "09b__阅后即焚漫谈___Ephemeral_Echo_Room.png",
        "title": "09b. 阅后即焚漫谈 / Ephemeral Room",
        "category": "Phase A · 亲密沟通",
        "shell": "mobile_stack (440px max)",
        "desc": "24 小时倒计时自动焚毁空间：暖琥珀色警告色调、焚毁时钟、永恒契约跃迁引导。",
        "atoms": ["24h 倒计时芯片", "琥珀告警横幅", "焚毁倒计时气泡", "跃迁永恒契约 CTA"]
    },
    {
        "id": "10",
        "folder": "10._direct_bind",
        "screenshot": "10__直接绑定___Direct_Bind.png",
        "title": "10. 直接绑定 / Direct Bind",
        "category": "Phase A · 伴侣绑定",
        "shell": "mobile_stack (440px max)",
        "desc": "直接输入已知伴侣钱包地址、ENS 或扫描二维码，核验身份并发送上链邀请函。",
        "atoms": ["地址输入框与扫码", "最近交互联系人", "发送邀请函按钮", "双方签名安全告示"]
    },
    {
        "id": "13",
        "folder": "13._accept_sign",
        "screenshot": "13__接受邀请与签署誓约___Accept_&_Sign.png",
        "title": "13. 接受邀请与签署 / Accept & Sign",
        "category": "Phase B · 双签契约",
        "shell": "mobile_stack (440px max)",
        "desc": "审阅伴侣发来的唯一定制邀请函，查验誓约条款，调起签名签署 Romantic Ring。",
        "atoms": ["邀请信笺封套", "誓约条款清单", "签名签署主按钮", "密码学有效性提示"]
    },
    {
        "id": "14",
        "folder": "14._ring_ceremony",
        "screenshot": "14__关系确立仪式___Ring_Ceremony.png",
        "title": "14. 关系确立仪式 / Ring Ceremony",
        "category": "Phase B · 唯美仪式",
        "shell": "mobile_stack (440px max)",
        "desc": "双方签名上链确认后的神圣确立仪式：莫比乌斯双环熔铸合体为永恒 Soulbound Ring。",
        "atoms": ["双环合体仪式动效", "铸造完成金印", "进入共同空间 CTA", "查看链上证明"]
    },
    {
        "id": "15",
        "folder": "16._our_story",
        "screenshot": "Our_Ring_主页与底部角标_(Our_Ring_Home).png",
        "title": "15. 我们的戒指 / Our Ring Home",
        "category": "Phase B · 专属空间",
        "shell": "mobile_tab (720px max)",
        "desc": "关系成立后的日常仪表盘：天数里程碑、双方呼吸状态、当前誓言与金库摘要。",
        "atoms": ["天体双环主视觉", "相伴天数计数器", "5-Tab 悬浮底栏", "心意直达卡"]
    },
    {
        "id": "16",
        "folder": "16._our_story",
        "screenshot": "16__共同记忆___Our_Story.png",
        "title": "16. 共同记忆 / Our Story",
        "category": "Phase B · 专属空间",
        "shell": "mobile_tab (720px max)",
        "desc": "专属双人时间轴时光机：按月份日期聚合照片、文字手账与里程碑事件。",
        "atoms": ["时间轴月份轴点", "手账照片卡片", "添加记忆浮动按钮", "类别过滤标签"]
    },
    {
        "id": "17",
        "folder": "17._our_vows",
        "screenshot": "17__神圣誓约___Our_Vows.png",
        "title": "17. 神圣誓约 / Our Vows",
        "category": "Phase B · 专属空间",
        "shell": "mobile_tab (720px max)",
        "desc": "编号誓约清单：双向签名验证状态芯片（已确认 / 对方待签）、提议新誓言。",
        "atoms": ["编号誓约卡", "双签状态绿色芯片", "新建誓约胶囊", "签名历史抽屉"]
    },
    {
        "id": "18",
        "folder": "18._our_bond",
        "screenshot": "18__愿望金库 / Our Bond",
        "title": "18. 愿望金库 / Our Bond",
        "category": "Phase B · 专属空间",
        "shell": "mobile_tab (720px max)",
        "desc": "双方共同储蓄金库与梦想愿望清单：实时合约余额、愿望进度条、存入共同金。",
        "atoms": ["金库总额显示牌", "愿望进度平滑动画", "共同存入主按钮", "存取明细记录"]
    },
    {
        "id": "22",
        "folder": "22._me_settings",
        "screenshot": "22__个人中心___Me_Settings.png",
        "title": "22. 个人中心 / Me Governance",
        "category": "Phase B · 治理中心",
        "shell": "mobile_tab (720px max)",
        "desc": "用户个人档案、隐私可见性开关、链上收据核对、实体纪念物 Witness 定制与关系治理。",
        "atoms": ["双签凭证详情", "隐私保护开关", "实体戒指定制器", "解除绑定治理区"]
    }
]

print("Built screens catalog and color categories.")
