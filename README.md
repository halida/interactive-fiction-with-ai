# 👻 Ghost Companion — Colossal Cave Adventure

> 一个原型实验：在经典文字冒险游戏 *Colossal Cave Adventure*（350 分版）旁边，加一个**只能看不能说（只能说不能做）的 AI 幽灵队友**。

**项目目标**：验证"有 AI 陪伴是否让游戏更有趣、更不容易卡关"。

> ⚠️ 这是**纯前端原型**，零后端、零构建步骤。**但必须通过 HTTP server 打开** —— 双击 `file://` 模式下游戏会卡在 "Initializing... please wait"（见下方说明）。

---

## 1. 怎么跑

### ⚠️ 必须用 HTTP server

**直接双击 `vendor/advent/advent.html` 打不开游戏。** 上游 CCA 引擎在 `file://` 协议下会抛 `cssRules` SecurityError（不同目录的 CSS 被浏览器视为不同 origin），导致 `sizeCalc()` 中断、整个 init 流程中止、屏幕永远停在 "Initializing... please wait"。

### 启动方式

#### A. 一键脚本（推荐）
```bash
./start.sh                     # 默认 8000 端口
./start.sh 8080                # 自定义端口
```
然后浏览器访问脚本打印的 URL。

#### B. 手动启动
```bash
python3 -m http.server 8000
# 然后访问 http://localhost:8000/vendor/advent/advent.html
```
或：`npx serve .`

---

## 2. 怎么配

进入游戏后，点右上角 ⚙ 按钮：
- **API Key**：你的 OpenAI / DeepSeek / Moonshot / 智谱 等的 Key。
- **Base URL**：默认 `https://api.openai.com/v1`；DeepSeek 用 `https://api.deepseek.com/v1`；Moonshot 用 `https://api.moonshot.cn/v1`；智谱用 `https://open.bigmodel.cn/api/paas/v4`。
- **Model**：如 `gpt-4o-mini`、`deepseek-chat`、`moonshot-v1-8k` 等。
- **Temperature**：0–1.5，默认 0.7。
- 点 **测试连接** 验证 → 点 **保存**。

> Key 只存你浏览器 `localStorage`，**不会**离开你的机器，也不会被任何后端收集。

### ⚠️ CORS 提示
浏览器端直连 LLM 时，对端点有 CORS 要求。**已实测支持 CORS** 的端点：OpenAI、DeepSeek、Moonshot。如果你用 Azure OpenAI 或自部署网关，可能需要换用支持 CORS 的端点。

---

## 3. 怎么玩

- 左侧 = CCA 游戏区，按经典规则玩：`go north`、`take lamp`、`open grate`、`inventory` 等。
- 右侧 = 👻 幽灵向导面板。每次你按 Enter，AI 都会"看"到游戏刚才发生了什么，然后说一句话。
- 右上角 ⚙ = 设置；⟳ = 重新开始（清空 AI 对话历史）。
- AI 看到的视野 = **从游戏开始到当前的所有内容**（无窗口截断）。

---

## 4. 项目结构

```
.
├── README.md
├── requirement.md                  # 完整需求文档
├── .gitignore
├── vendor/
│   └── advent/                     # 第三方 CCA 引擎（sulkasormi/advent）
│       ├── advent.html             # ← 项目入口（已微调 + 注入 Ghost Companion）
│       ├── css/, js/, json/        # 原样保留
│       └── README.md               # 原项目说明
├── css/
│   └── companion.css               # AI 面板 / 设置弹窗样式
└── js/
    ├── prompt.js                   # system prompt + 消息构造
    ├── settings.js                 # 设置面板 + localStorage + 连接测试
    └── companion.js                # 主逻辑：DOM 注入 + 事件捕获 + LLM 流式
```

---

## 5. 第三方致谢

本项目集成的 Colossal Cave Adventure 引擎来自
**[sulkasormi/advent](https://github.com/sulkasormi/advent)**，
原作基于 1976/1977 年的 Crowther/Woods 公共领域作品，作者 sulkasormi 在
JavaScript 移植版本中保留了署名要求。本项目亦在 UI 上保留其署名。

LLM 调用通过官方 [`openai` JS SDK](https://github.com/openai/openai-node)
（v4.x，已支持浏览器原生 ESM）从浏览器端直接发起。

---

## 6. 已知限制

- **CORS**：所选 LLM 端点必须支持浏览器跨域调用。
- **上下文长度**：AI 视野完整无截断；游戏回合数过多时可能超出模型上下文窗口（典型阈值 8k / 16k / 32k tokens）。若超长，请换用更长上下文的模型。
- **不是 CCA 完整规则**：原版 CCA 是 350 分完整版，本项目直接复用原版引擎；但**只用了它的极简入口**（gemhub 没改、npc/score 系统未自实现校验）。如需完整玩法，使用原版即可。
- **AI 不读取玩家输入框里的内容**：只能看到玩家按 Enter 之后游戏"已确认"的命令。
- **重启 = 整页 reload**：上游引擎没有公开 reset API，所以"重新开始"按钮会刷页面（localStorage 保留）。

---

## 7. 实验反馈建议（自评，不在产品内）

> 这是给自己看的，不是产品功能：
> - 玩了几局后，记下哪些时刻 AI 帮到了你、哪些时刻剧透了或抢戏。
> - 是否仍感觉孤独 vs 有陪伴感？
> - 是否仍卡关？