# even-hub-plugin · 无声之声 Even Hub 主插件

这是新的主客户端目录，目标是用一个安装在官方 Even Realities App 内的
Even Hub 插件完成：

- Even G2 麦克风采音
- backend ASR / LLM / TTS 调用
- 眼镜 HUD 候选展示
- Even R1 戒指选择
- 手机扬声器代用户发声
- 插件手机控制页中的个性化设置

这样不再需要单独维护一套自研 Android/iOS App。官方 Even Realities App
仍然必需，因为它负责 G2/R1 的连接、插件安装和运行。

## 当前状态

**仅完成架构和开发交接文档，尚未初始化运行时代码。**

不要把本目录与现有目录混淆：

- `config-app/`：保留的 React Native 安卓配置 App，不删除，当前冻结为备用方案。
- `glasses-app/`：早期 Vite 状态机骨架，不删除，供参考。
- `even-hub-plugin/`：后续基于 Even 官方 ASR 模板开发的主插件。

## 开始前阅读

1. [DEVELOPMENT.md](DEVELOPMENT.md)
2. [AGENTS.md](AGENTS.md)
3. [../docs/接口契约.md](../docs/接口契约.md)
4. [../backend/README.md](../backend/README.md)

官方资料：

- [Even Hub 官方说明](https://support.evenrealities.com/hc/en-us/articles/15688149217167-Even-Hub)
- [Even 官方 G2 插件模板](https://github.com/even-realities/evenhub-templates)
- [Even Hub 文档](https://hub.evenrealities.com)

