# glasses-app · 眼镜插件（A）

Even G2 眼镜插件（跑在手机上）：采 4 麦 PCM、HUD 渲染候选、R1/镜腿输入、云编排、播 TTS、选择状态机。

## 现状（已接 SDK）
- `src/main.ts`：状态机 + push-to-listen + 双层兜底调用；只管状态机与云编排。
- `src/hub.ts`：Even Hub SDK 适配层（采音/HUD/输入/播音）。**双模式**——有 Even bridge（Even App/模拟器）走真实 SDK；纯浏览器自动回退键盘(Enter/↑/↓/空格/Esc)+DOM，`npm run dev:glasses` 即可开发联调。
- `src/playback.ts`：手机单实例播音控制器；等待真正播完，支持紧急取消与 Web Speech 降级。
- `app.json`：插件清单，已声明 `g2-microphone` 权限。

## 启动
```bash
npm install            # 仓库根执行一次
npm run dev:glasses    # 纯浏览器开发（键盘代替戒指）
npm --workspace glasses-app run sim   # 用模拟器预览（需 dev 已在 :5173）
npm --workspace glasses-app test      # 播音与设置迁移单测
```
浏览器打开后按 **Enter** 开始聆听（开发期用键盘代替戒指）。

## SDK 接入落点（见 src/hub.ts）
- 采音：`bridge.audioControl(true, Glasses)` → PCM 经 `onEvenHubEvent` 的 `audioEvent.audioPcm` 流式累积 → 关麦拼 base64
- HUD：`createStartUpPageContainer` 建屏 + `textContainerUpgrade` 无闪更新
- 输入：`onEvenHubEvent` → RawInput（来源仅 `sysEvent.eventSource` 携带，镜腿 double-tap 真机需复验）
- 播音：SDK 无输出 API，用 WebView `new Audio(base64)` 播手机扬声器；等待 `ended` 后才退出 SPEAKING

## 待办（A，见接口契约 §6）
- [x] 模拟器/浏览器跑通 HUD 4 候选 + 高亮
- [x] R1/镜腿事件接入（`onEvenHubEvent`，保留键盘开发兜底）
- [x] push-to-listen 采音（LISTENING 开麦、SPEAKING 不开麦，防回声）
- [x] 内置本地模板库断网兜底（`@vftv/shared` 的 `pickTemplateCandidates`）
- [x] 候选在客户端再次规范化为恰好 4 条、去重且 ≤12 Unicode 字符
- [x] 隐私快捷模式不采音、不联网，直接显示本地短语
- [x] 手机设备检查卡显示 bridge/backend/PCM/耗时/降级来源
- [ ] **真机**：验 PCM 字节率、事件映射、完整播音、紧急抢占与端到端延迟

> 浏览器开发的后端地址默认 `http://localhost:8787`。真机包不要手改 IP，
> 从仓库根运行 `npm run demo:pack -- --backend-url http://<Mac-IP>:8787`；
> 命令会生成临时网络白名单和 `glasses-app/voiceless.ehpk`。
