# 无声之声 · Voice for the Voiceless

> 面向社交表达障碍 / 神经多样性人群（社恐、发音不标准、思维节奏不同）的**社交表达搭子（"嘴替"）**：
> 眼镜实时听懂对方说的话，云端 AI 生成 4 个候选回复显示在 HUD 上，你用戒指轻轻一选，手机代你说出口。

面向的是「**能听、能想，却卡在'说出口'这一步**」的人——不是不能说话的医疗失语者，而是身边真实存在、想表达却开不了口的人。

## 当前架构（Even Hub 插件 + backend）

| 角色 | 载体 | 职责 |
|---|---|---|
| 显示 + 采音 | 👓 Even G2 眼镜 | HUD 显示候选（单色绿 ≤4 条）· 四麦 16kHz PCM · R1/镜腿事件 |
| 输入 | 💍 Even R1 戒指 | swipe 导航 / tap 确认 / double-tap 换批（镜腿 double-tap 紧急）|
| 主客户端 | 📱 官方 Even App 内的 Even Hub 插件 | 收 PCM/事件 → 调 backend → 推候选回 HUD → 手机扬声器外放 TTS；手机控制页同时负责个性化配置 |
| 后端 | 🧠 Node/TS backend | SenseVoice 离线 ASR + OpenAI 兼容 LLM + Edge TTS + profile 持久化 |

> 不再需要自研 Android/iOS App 作为主客户端，但仍需要官方 Even Realities App
> 连接 G2/R1 并承载插件。开发和比赛 Demo 阶段 backend 可运行在 Mac；正式部署再迁移云端。
> 新插件方案见 [even-hub-plugin/DEVELOPMENT.md](even-hub-plugin/DEVELOPMENT.md)，
> 模块协议见 [docs/接口契约.md](docs/接口契约.md)。

## 仓库结构

```
├── docs/          方案 / 接口契约 / 赛道信息
├── content/       内容与运营：小红书 Build in Public、对外文案（C）
├── shared/        接口契约单一真相源：共享类型 + 模板库（插件与 backend 共用）
├── even-hub-plugin/ 新的 Even Hub 主插件（文档已建，运行时代码待初始化）
├── glasses-app/   旧浏览器状态机骨架，保留参考
├── backend/       Node/TS：ASR + LLM + TTS + profile（B）
└── config-app/    已跑通的 React Native 安卓配置 App，保留为备用（B）
```
根为 npm workspaces monorepo（shared/backend/glasses-app）；config-app 为 Expo 独立工程（自管依赖）。

## 快速开始（协作者）

```bash
npm install                 # 根目录一次，装好 shared/backend/glasses-app
cp backend/env.example backend/.env # 如需真实 LLM，填入 LLM_API_KEY
npm run dev:backend         # 起后端(:8787)
curl http://127.0.0.1:8787/health
```

离线 ASR 模型首次安装见 `backend/models/README.md`。新插件从
`even-hub-plugin/DEVELOPMENT.md` 开始，优先采用 Even 官方 ASR 模板。

**先读**：`AGENTS.md` + `even-hub-plugin/DEVELOPMENT.md` +
`docs/接口契约.md`。

**分工**：A→Even Hub 插件；B→backend（config-app 冻结备用）；C→content。

## 参赛赛道

主攻 **未来火种(05) + Qoder(04)**；**Superun(17)** 有身边真实用户背书（详见方案 §2）；小红书(07) 视内容带宽。详见方案 §8。

## 约束

**2 人 · 3 天 · Demo 优先**（端到端 ≤5s 可接受）。功能砍序见方案 §7 的 P0/P1/P2。
