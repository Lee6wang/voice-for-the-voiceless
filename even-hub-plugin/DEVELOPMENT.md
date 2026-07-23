# 无声之声 Even Hub 插件开发文档

> 状态：架构已确定，插件运行时代码尚未初始化  
> 更新：2026-07-24  
> 目标：用 Even Hub 插件替代独立配置 App 成为唯一主客户端

## 1. 为什么改成插件

Even Hub 插件会安装并运行在手机上的官方 Even Realities App 中，同时可以：

- 在手机打开插件控制界面；
- 接收 Even G2 的麦克风与交互数据；
- 向眼镜 HUD 推送 UI；
- 接收镜腿和 R1 戒指操作；
- 通过网络访问我们的 backend。

因此，名字、常用表达、语气等设置可以放进插件的手机控制界面，不需要再
单独发布自研 Android/iOS App。

这里的“不需要 App”准确含义是：

- 不需要我们自己开发的 `config-app`；
- 仍需要官方 Even Realities App 连接 G2/R1 并承载 Even Hub 插件；
- 眼镜不是独立计算主机，主要承担采音、显示和输入。

## 2. 目标架构

```text
Even G2：麦克风 + HUD          Even R1：tap / swipe / double-tap
              \                 /
               \ BLE / Even Bridge
                v
     官方 Even Realities App 内的无声之声插件
     ├─ 手机控制页：名字 / 常用语 / 语气 / 紧急表达
     ├─ 状态机：IDLE / LISTENING / THINKING / CANDIDATES / SPEAKING
     ├─ PCM 收集与 base64 编码
     ├─ HUD 4 候选与高亮
     ├─ 戒指选择
     └─ 手机扬声器播放 MP3
                |
                | HTTP，开发时走同一局域网
                v
     backend（Mac/云主机）
     ├─ /asr：SenseVoice 离线识别
     ├─ /candidates：LLM 个性化候选 + 模板兜底
     ├─ /tts：Edge TTS + 磁盘缓存
     ├─ /profile：JSON 持久化配置
     └─ /health：能力状态
```

最终演示只需要：

```text
Even G2 + Even R1 + 一部安装官方 Even App 的手机 + 可访问的 backend
```

开发阶段 backend 可以运行在 Mac；正式产品再迁移云端。

## 3. 保留与冻结的现有工程

### `config-app/`

必须保留，不删除、不重写。它已经在安卓模拟器跑通配置读取与保存，可作为：

- Even 插件手机控制页失败时的备用配置入口；
- backend `/profile` 的人工联调工具；
- 未来独立移动端产品的原型。

在主插件闭环完成前，不继续投入表单美化、登录或 iOS 发布。

### `glasses-app/`

保留早期状态机、模板兜底和 backend 调用思路，但不要直接把它当成已完成的
Even 插件。它没有接入真实 Even Hub SDK。

### `backend/` 与 `shared/`

继续复用，不重写。当前已经具备：

- 真实 OpenAI 兼容 LLM provider；
- profile 注入、4 候选清洗、12 字限制；
- sherpa-onnx + SenseVoice 本地 ASR；
- msedge-tts 与 MP3 磁盘缓存；
- profile JSON 持久化；
- 22 类模板规则；
- backend 与插件两层兜底所需共享函数。

## 4. 后端接口

插件只依赖以下接口。类型以 `shared/src/types.ts` 为准。

### `GET /health`

```json
{
  "ok": true,
  "llm": true,
  "tts": true,
  "asr": true,
  "uptime": 123
}
```

插件启动时先请求它，在手机控制页展示连接状态。

### `GET /profile?userId=demo`

读取用户配置。Demo 固定 `userId=demo`。

### `POST /profile`

```json
{
  "userId": "demo",
  "name": "小明",
  "commonPhrases": ["容我想想", "谢谢你"],
  "tone": "plain",
  "emergencyText": "请帮帮我"
}
```

插件手机控制页保存设置时调用。backend 会持久化，并在后台预生成常用语 TTS。

### `POST /asr`

```json
{
  "audio": "<base64 PCM16LE>",
  "final": true
}
```

音频必须是：

- 16 kHz
- mono
- signed 16-bit little-endian PCM
- 不带 WAV 文件头

响应：

```json
{ "text": "你周末有空吗" }
```

### `POST /candidates`

```json
{
  "turnId": "t_123",
  "heardText": "你周末有空吗",
  "profile": {
    "userId": "demo",
    "commonPhrases": ["容我想想"],
    "tone": "plain"
  },
  "exclude": []
}
```

正常响应恒为 4 条候选：

```json
{
  "turnId": "t_123",
  "candidates": [
    { "id": "c1", "text": "周末可以" },
    { "id": "c2", "text": "我看看日程" },
    { "id": "c3", "text": "下次吧" },
    { "id": "c4", "text": "几点出发" }
  ]
}
```

### `POST /tts`

```json
{ "text": "周末可以", "voice": "default" }
```

响应：

```json
{
  "audio": "<base64 mp3>",
  "mime": "audio/mpeg"
}
```

插件把 base64 转成 Blob/Object URL，通过手机控制页面的 `<audio>` 或 Web Audio
播放。眼镜本身没有扬声器。

## 5. 插件状态机

```text
IDLE
  tap
  ↓
LISTENING：显示“聆听中”，采音 3～5 秒
  ↓
THINKING：停止采音，依次请求 /asr 与 /candidates
  ↓
CANDIDATES：HUD 显示 4 条，第一条默认高亮
  ├─ swipe_up/down：移动高亮
  ├─ double_tap：传 exclude 换一批
  └─ tap：确认
       ↓
SPEAKING：停止采音，请求 /tts，手机播放
       ↓
IDLE
```

任意状态下的镜腿紧急手势：

1. 取消当前请求和采音；
2. 读取 `profile.emergencyText`；
3. 优先播放缓存音频；
4. 返回 IDLE。

必须保证 SPEAKING 期间不采音，否则手机刚播放的声音会再次进入 ASR。

## 6. 手机控制界面

插件手机页面只做 Demo 必需内容：

- backend 地址；
- backend `/health` 状态；
- 名字；
- 常用表达；
- 语气；
- 紧急表达；
- “保存并同步”；
- “启用声音”按钮；
- 最近一次 ASR 原文和错误日志。

“启用声音”按钮必须由用户在手机上主动点击一次，用来满足 WebView/浏览器的
音频播放权限要求。不要等到戒指选中后才第一次尝试播放。

配置优先保存在 backend；同时可在 `localStorage` 留一份缓存，backend 断开时
仍能读取紧急表达和个性化模板。

## 7. 开发顺序

### Phase 0：验证官方模板，不写业务

1. 注册 Even Hub 开发者账号。
2. 安装官方 CLI、SDK 和 simulator。
3. 单独运行官方 `minimal` 模板，确认 HUD 能显示。
4. 运行官方 `asr` 模板，确认能收到 G2 PCM。
5. 在真机确认 R1 与镜腿实际事件名。

官方模板：

<https://github.com/even-realities/evenhub-templates>

不要先复制旧 `glasses-app`；应以官方 `asr` 模板为运行时底座，再把本项目状态机
和接口调用迁入。

### Phase 1：建立插件最小工程

把官方 ASR 模板的运行时代码引入本目录，同时保留本文件和 `AGENTS.md`。

最小完成标准：

1. `npm run dev` 能启动；
2. `evenhub-simulator` 能打开；
3. 手机控制页能请求 backend `/health`；
4. HUD 能显示“无声之声已连接”。

### Phase 2：打通假文本候选

先不碰音频：

1. 固定 `heardText="你周末有空吗"`；
2. 读取 `/profile`；
3. 请求 `/candidates`；
4. HUD 显示 4 条；
5. R1/模拟器事件可以切换高亮。

验收重点是 HUD 和戒指，不是模型。

### Phase 3：接真实采音与 ASR

1. 使用官方 ASR 模板的 PCM 回调；
2. 累积 3～5 秒 PCM；
3. 确认没有 WAV 头且为 PCM16LE；
4. base64 后请求 `/asr`；
5. 在手机控制页显示 ASR 原文；
6. 再请求 `/candidates`。

第一轮使用整段识别，不做 WebSocket 流式 ASR。

### Phase 4：接手机 TTS

1. 在手机控制页点击“启用声音”；
2. 用固定 base64 MP3 验证播放；
3. 请求 backend `/tts`；
4. 戒指 tap 后播放候选；
5. 播放期间锁定输入和采音；
6. 验证紧急表达缓存。

如果 Even WebView 无法可靠播放，降级顺序：

1. Web Speech API `speechSynthesis`；
2. 保留的 `config-app` 负责播放；
3. 现场外接一个简单网页播放器。

### Phase 5：断网和演示

1. backend 的 LLM 断开：应返回模板候选；
2. backend 完全断开：插件用本地 `shared` 模板；
3. TTS 断网：已预生成句子仍能播放；
4. 固化 3 组 Demo 问答和一个紧急场景；
5. 记录每步耗时，目标“说完到候选上屏 ≤5 秒”。

## 8. 本地联调

启动 backend：

```bash
cd /Users/hyj/workspace/project/03_AdvX/voice-for-the-voiceless
npm install
cp backend/env.example backend/.env
npm run dev:backend
```

首次使用 ASR：

```bash
cd backend/models
curl -sL -o sensevoice.tar.bz2 \
  https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/sherpa-onnx-sense-voice-zh-en-ja-ko-yue-2024-07-17.tar.bz2
tar xjf sensevoice.tar.bz2
```

检查：

```bash
curl http://127.0.0.1:8787/health
```

真机插件不能用 `localhost:8787`，应使用：

```text
http://<Mac 当前局域网 IP>:8787
```

手机与 Mac 必须处于同一 Wi-Fi/热点，且 macOS 防火墙允许 Node 接收入站连接。

## 9. 验收清单

- [ ] 官方 minimal 模板在 simulator 显示
- [ ] 官方 ASR 模板收到真实 G2 PCM
- [ ] R1 tap/swipe/double-tap 事件已确认
- [ ] 插件手机控制页可读写 profile
- [ ] 固定文本可以生成并显示 4 个候选
- [ ] 真实 G2 语音可以经 `/asr` 转写
- [ ] 候选可以由 R1 高亮和确认
- [ ] 手机能播放 `/tts` 返回的 MP3
- [ ] SPEAKING 期间没有回声重识别
- [ ] backend 断开时本地模板仍可显示
- [ ] 端到端延迟实测 ≤5 秒
- [ ] 已录制备用 Demo 视频

## 10. 已知风险

- Even Hub SDK/CLI 仍处于快速迭代期，优先相信当前官方模板，不凭旧记忆写 API。
- 插件的手机 WebView 音频播放能力尚未真机验证，这是第一优先风险。
- backend 目前无鉴权，只能运行在可信局域网。
- ASR 模型不进入 Git，新电脑必须单独下载。
- Even Hub 发布条款目前限制医疗/健康类插件；比赛可先走开发者 QR 测试，
  对外口径保持“社交表达辅助”，不要宣传诊断或治疗功能。

