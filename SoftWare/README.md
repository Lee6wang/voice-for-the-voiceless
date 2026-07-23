# SoftWare

代码目录，三个模块（待开发）：

- `glasses-app/` —— Even G2 眼镜插件（TypeScript / Even Hub SDK，跑在手机上）
  - 接收四麦 16kHz PCM + R1/镜腿输入事件
  - HUD 渲染候选卡片（单色绿，≤4 条）
  - 云 API 编排（ASR→LLM 出候选→TTS）→ 手机扬声器外放
- `config-app/` —— 手机配置 App：名字/常用语/语气等个性化 → 写入薄后端
- `backend/` —— 薄云后端：配置存储 + 云 API 密钥代理（serverless 函数或小 Node 服务，不做重计算）

> 模块间协议见 `../docs/接口契约.md`。
> 早期 Zlo 戒指 SDK 与本地模型方案均已废弃（改用 Even R1 + 云 API），相关文件已从仓库移除。
