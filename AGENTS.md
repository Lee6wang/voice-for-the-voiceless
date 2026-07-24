# 无声之声：仓库级 AI 交接

> 更新：2026-07-24  
> 本文件适用于整个仓库；进入 `even-hub-plugin/` 后还必须阅读其中的
> `AGENTS.md` 与 `DEVELOPMENT.md`。

## 1. 当前产品与架构决定

项目目标：让不方便临场开口的人通过 Even G2 看到 AI 生成的 4 个回复，
用 Even R1 选择，再由手机替用户发声。

当前决定已经从“两套手机前端”简化为：

```text
Even G2 + R1
    ↕
官方 Even Realities App 中的 Even Hub 插件（主客户端）
    ↕
backend：ASR + LLM + TTS + profile
```

准确含义：

- 不再把自研 React Native App 作为主客户端；
- 官方 Even Realities App 仍然必需；
- `config-app/` 必须保留，冻结为备用配置入口；
- 新的主插件在 `even-hub-plugin/` 开发；
- `glasses-app/` 是旧浏览器骨架，保留参考，不宣称已接真实 SDK。

仓库当前的产品口径是“社交表达辅助”，不是诊断或治疗工具。

## 2. 协作与 Git

- 仓库：`https://github.com/Lee6wang/voice-for-the-voiceless`
- 当前分支：`feat/b-profile-flow`
- Draft PR：<https://github.com/Lee6wang/voice-for-the-voiceless/pull/1>
- Git 身份：`Hajoy7 <1052292556@qq.com>`
- 用户原角色 B：`backend/` + `config-app/`
- A 原职责：眼镜插件
- C 原职责：内容与文案

新的 `even-hub-plugin/` 会替代旧 `glasses-app/` 成为主插件。深度开发前应和
A 同步所有权；用户明确要求时可直接推进。

开始修改前：

```bash
git status --short --branch
```

如果有其他人或 AI 的未提交修改，必须保留，不能 reset、覆盖或擅自 rebase。
大改动通过当前分支和 PR review，不直接合并 main。

## 3. 目录状态

| 目录 | 状态 | 用途 |
|---|---|---|
| `even-hub-plugin/` | MVP 已实现，构建/打包通过，真机待验 | 新的 Even Hub 主插件 |
| `backend/` | 核心能力已实现 | ASR、LLM、TTS、profile |
| `shared/` | 可用 | 共享类型和 22 类模板 |
| `config-app/` | 安卓模拟器已跑通，现冻结 | 备用配置入口 |
| `glasses-app/` | 仅浏览器骨架 | 旧状态机参考 |
| `docs/` | 接口契约为共享事实来源 | 方案与协议 |
| `content/` | 内容成员维护 | 对外文案 |

## 4. 已完成且验证过

### backend

- `GET /health`
- `GET/POST /profile`
  - JSON 文件持久化
  - 保存和启动时预生成关键句 TTS 缓存
- `POST /candidates`
  - OpenAI 兼容 LLM provider
  - 注入名字、常用表达和语气
  - 解析、去重、每条 ≤12 字、补足 4 条
  - LLM 失败自动走模板
- `POST /tts`
  - msedge-tts
  - base64 MP3
  - 磁盘缓存
- `POST /asr`
  - sherpa-onnx + SenseVoice
  - PCM16LE 16kHz mono 整段离线识别
- 22 类本地模板规则

2026-07-24 实际验收：

- backend 类型检查通过；
- `/health` 显示 LLM/TTS/ASR 全部就绪；
- 真实 LLM 返回两组不同 profile 风格的 4 候选；
- TTS 返回有效 MP3；
- ASR 模型成功初始化并处理 PCM 请求；
- profile 写入并在重启后恢复；
- 候选解析器与 ASR 静音门共有 8 个回归测试。

注意：

- ASR 已验证模型和请求链路，但尚未用 Even G2 的真实 PCM 验证中文准确率。
- 模型目录约 1.1GB，本地存在但被 Git 忽略。
- API Key 和 backend 数据均被忽略，不能提交。

### config-app

- Expo/React Native 配置页已完成；
- 名字、常用表达、语气、紧急表达可编辑；
- `/profile` 读取与保存可用；
- Android Studio 已安装并同步；
- 安卓模拟器已显示页面并成功保存；
- NVM Node 与 Metro IPv6 问题已有文档和启动脚本。

它现在是备用，不删除，但不继续扩展登录、iOS 或视觉细节。

### glasses-app

- 浏览器状态机、键盘模拟、backend 请求和本地模板思路存在；
- 没有真实 Even Hub SDK；
- 没有真实 G2 采音、HUD、R1 和手机发声。

### even-hub-plugin

- Even Bridge、HUD、G2 PCM 收集、R1/镜腿事件路由；
- `/health`、`/profile`、`/asr`、`/candidates`、`/tts` 客户端；
- 手机控制页、声音解锁、profile 缓存、时间/场景上下文；
- 本地模板兜底、三级发声降级、紧急手势抢占；
- TypeScript/Vite 构建和 `.ehpk` 打包已通过。

以上是代码和打包状态，不代表 G2/R1 真机已经验证。

## 5. 当前未完成

最主要缺口是客户端硬件验收：

1. simulator 与真机 HUD；
2. G2 PCM 格式和中文识别准确率；
3. R1/镜腿真实事件源和方向；
4. `/tts` MP3 在手机 WebView 播放；
5. SPEAKING 防回声实测；
6. 端到端延迟测量；
7. 真机排练和备用视频。

不要继续重复开发 backend ASR、LLM 或 TTS，除非实际联调发现接口缺陷。

## 6. 接下来怎么开发

进入：

```text
even-hub-plugin/
```

先读该目录 `DEVELOPMENT.md`、`AGENTS.md` 和 `docs/联调指南.md`。代码链路已
搭好，下一步从桥/HUD开始逐层做真机联调并记录结果；不要重新初始化工程。

## 7. 关键交互不变

- push-to-listen，不常开麦；
- HUD 固定 4 个短候选；
- swipe 移动，tap 确认，double-tap 换批；
- 镜腿紧急手势优先级最高；
- SPEAKING 时停止采音；
- AI 不自动替用户决定，必须由用户确认后发声；
- backend 失败时有模板，backend 完全不可达时插件本地模板。

## 8. 本地运行

根依赖：

```bash
npm install
```

backend：

```bash
test -f backend/.env || cp backend/env.example backend/.env
npm run dev:backend
curl http://127.0.0.1:8787/health
```

ASR 模型安装见：

```text
backend/models/README.md
```

config-app 备用调试：

```bash
cd config-app
npx expo start --lan
npm run studio
```

真机访问 backend 时必须使用 Mac 当前局域网 IP，不能使用 localhost。

## 9. 安全与文件约束

严禁提交：

- `backend/.env` 和所有密钥；
- `backend/models/` 模型；
- `backend/data/` profile 与音频缓存；
- `config-app/.env.local`；
- `config-app/android/`；
- `node_modules/`、`dist/`；
- APK、`.ehpk`、录音和大二进制。

接口变化顺序：

1. `shared/src/types.ts`
2. `docs/接口契约.md`
3. backend
4. Even Hub 插件

backend 当前无鉴权且允许 CORS，只能用于可信局域网，不能直接暴露公网。

## 10. 交付前验证

```bash
npm --workspace backend test
npx tsc --noEmit -p backend/tsconfig.json
npm --workspace glasses-app run build
cd config-app && npm run typecheck
git diff --check
git status --short
```

插件改动后还必须运行自己的打包检查。
插件当前交付命令为：

```bash
npm --workspace even-hub-plugin run pack
```

汇报时明确区分：

- 代码存在；
- 类型检查或 simulator 已通过；
- Even G2 真机已通过；
- Even R1 真机已通过。
