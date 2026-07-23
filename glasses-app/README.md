# glasses-app · 眼镜插件（A）

> **归档状态（2026-07-24）：**这是早期浏览器状态机骨架，保留参考，不删除。
> 新的主客户端在 `../even-hub-plugin/`，并将以 Even 官方 ASR 模板为底座接入
> 真实 G2/R1。不要在没有团队确认的情况下继续扩展本目录。

Even G2 眼镜插件（跑在手机上）：采 4 麦 PCM、HUD 渲染候选、R1/镜腿输入、云编排、播 TTS、选择状态机。

## 现状（骨架）
- `src/main.ts` 已搭好**状态机 + push-to-listen + 双层兜底调用**，用键盘（Enter/↑/↓/空格/Esc）在浏览器里模拟戒指事件。
- 标注 `TODO(SDK)` 的 4 处需接 Even Hub SDK：采音、HUD 渲染、输入事件、播音到手机扬声器。

## 启动
```bash
npm install            # 仓库根执行一次
npm run dev:glasses    # 或：npm --workspace glasses-app run dev
```
浏览器打开后按 **Enter** 开始聆听（开发期用键盘代替戒指）。

## 接 Even Hub SDK
1. 确认版本后安装：`npm i @evenrealities/even_hub_sdk`
2. 用 `evenhub-simulator` 预览：把 HUD 渲染/输入事件换成 SDK 的真实回调
3. 把 `captureAudio` / `renderHUD` / `renderCandidates` / 输入监听 / `speak` 的播放换成 SDK 实现

## 待办（A，见接口契约 §6）
- [ ] 模拟器跑通 HUD 4 候选 + 高亮
- [ ] R1/镜腿事件接入（替换键盘）
- [ ] push-to-listen 采音 + SPEAKING 静音麦（防回声）+ 分段反馈
- [ ] 选中→播 WAV 到手机扬声器（**Day0 验证插件能否播音**）
- [ ] 内置本地模板库断网兜底（已用 `@vftv/shared` 的 `pickTemplateCandidates`）

> 后端地址通过 `VITE_BACKEND_URL` 配置，默认 `http://localhost:8787`。
