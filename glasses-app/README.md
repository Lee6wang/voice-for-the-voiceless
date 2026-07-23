# glasses-app · 眼镜插件（A）

Even G2 眼镜插件（跑在手机上）：采 4 麦 PCM、HUD 渲染候选、R1/镜腿输入、云编排、播 TTS、选择状态机。

## 现状（已接 SDK）
- `src/main.ts`：状态机 + push-to-listen + 双层兜底调用；只管状态机与云编排。
- `src/hub.ts`：Even Hub SDK 适配层（采音/HUD/输入/播音）。**双模式**——有 Even bridge（Even App/模拟器）走真实 SDK；纯浏览器自动回退键盘(Enter/↑/↓/空格/Esc)+DOM，`npm run dev:glasses` 即可开发联调。
- `app.json`：插件清单，已声明 `g2-microphone` 权限。

## 启动
```bash
npm install            # 仓库根执行一次
npm run dev:glasses    # 纯浏览器开发（键盘代替戒指）
npm --workspace glasses-app run sim   # 用模拟器预览（需 dev 已在 :5173）
```
浏览器打开后按 **Enter** 开始聆听（开发期用键盘代替戒指）。

## SDK 接入落点（见 src/hub.ts）
- 采音：`bridge.audioControl(true, Glasses)` → PCM 经 `onEvenHubEvent` 的 `audioEvent.audioPcm` 流式累积 → 关麦拼 base64
- HUD：`createStartUpPageContainer` 建屏 + `textContainerUpgrade` 无闪更新
- 输入：`onEvenHubEvent` → RawInput（来源仅 `sysEvent.eventSource` 携带，镜腿 double-tap 真机需复验）
- 播音：SDK 无输出 API，用 WebView `new Audio(base64)` 播手机扬声器（**Day0 命脉**）

## 待办（A，见接口契约 §6）
- [x] 模拟器/浏览器跑通 HUD 4 候选 + 高亮
- [x] R1/镜腿事件接入（`onEvenHubEvent`，保留键盘开发兜底）
- [x] push-to-listen 采音（LISTENING 开麦、SPEAKING 不开麦，防回声）
- [x] 内置本地模板库断网兜底（`@vftv/shared` 的 `pickTemplateCandidates`）
- [ ] **真机**：验采音有 PCM、事件映射与镜腿来源、**base64 音频从手机扬声器响**（Day0 命脉）

> 后端地址通过 `VITE_BACKEND_URL` 配置，默认 `http://localhost:8787`。
