# 无声之声 · Voice for the Voiceless

> 面向社交表达障碍 / 神经多样性人群（社恐、发音不标准、思维节奏不同）的**社交表达搭子（"嘴替"）**：
> 眼镜实时听懂对方说的话，云端 AI 生成 4 个候选回复显示在 HUD 上，你用戒指轻轻一选，手机代你说出口。

面向的是「**能听、能想，却卡在'说出口'这一步**」的人——不是不能说话的医疗失语者，而是身边真实存在、想表达却开不了口的人。

## 硬件与架构（Even 眼镜/戒指 + 手机 + 云 API）

| 角色 | 载体 | 职责 |
|---|---|---|
| 显示 + 采音 | 👓 Even G2 眼镜 | HUD 显示候选（单色绿 ≤4 条）· 四麦 16kHz PCM · R1/镜腿事件 |
| 输入 | 💍 Even R1 戒指 | swipe 导航 / tap 确认 / double-tap 换批（镜腿 double-tap 紧急）|
| 大脑 | 📱 Even Hub 插件（TS，跑在手机上） | 收 PCM/事件 → 调云 API → 推候选回 HUD → 手机扬声器外放 TTS |
| 配置 | 📱 手机配置 App | 名字/常用语/语气等个性化 → 写入薄云后端 |
| 云 | ☁️ ASR + LLM + TTS ／ 薄后端 | 语音转写 / 候选生成 / 语音合成；薄后端存配置 + 代管 API 密钥 |

> **笔记本已不在链路里**。完整方案见 [docs/无声之声-项目方案.md](docs/无声之声-项目方案.md)（§3 交互 · §4 架构 · §5 可行性 · §7 排期）；模块间协议见 [docs/接口契约.md](docs/接口契约.md)。

## 仓库结构

```
├── docs/          方案 / 接口契约 / 赛道信息
├── content/       内容与运营：小红书 Build in Public、对外文案（C）
├── shared/        接口契约单一真相源：共享类型 + 模板库（glasses-app 与 backend 共用）
├── glasses-app/   眼镜插件 · TS + Even Hub SDK（A）
├── backend/       云后端 · Node/TS：配置存储 + 云 API 代理（B）
└── config-app/    独立配置 App · React Native + Expo（B）
```
根为 npm workspaces monorepo（shared/backend/glasses-app）；config-app 为 Expo 独立工程（自管依赖）。

## 快速开始（协作者）

```bash
npm install                 # 根目录一次，装好 shared/backend/glasses-app
cp .env.example backend/.env # 填入云 API 密钥
npm run dev:backend         # 起后端(:8787)
npm run dev:glasses         # 起眼镜插件（浏览器按 Enter 开始聆听）
# config-app 单独初始化，见 config-app/README.md
```

**先读**：`docs/无声之声-项目方案.md`（§3 交互 · §4 架构 · §7 排期）+ `docs/接口契约.md`（模块边界，改接口先改它）。

**分工**：A→`glasses-app`；B→`backend`+`config-app`；C→`content`。

## 参赛赛道

主攻 **未来火种(05) + Qoder(04)**；**Superun(17)** 有身边真实用户背书（详见方案 §2）；小红书(07) 视内容带宽。详见方案 §8。

## 约束

**2 人 · 3 天 · Demo 优先**（端到端 ≤5s 可接受）。功能砍序见方案 §7 的 P0/P1/P2。
