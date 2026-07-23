# Even Hub 插件：AI 交接说明

> 适用范围：`even-hub-plugin/` 及其未来子目录  
> 更新：2026-07-24

## 当前事实

- 本目录是新的主客户端方向。
- 目前只有文档，**没有可运行插件代码**。
- 不要把 `glasses-app/` 的浏览器骨架描述成真实 Even SDK 已接通。
- 不要删除 `config-app/`；它是已跑通的安卓备用配置入口。
- 官方 Even Realities App 仍然必需，它负责连接 G2/R1 并承载插件。

完整开发方案先读：

1. `DEVELOPMENT.md`
2. `../docs/接口契约.md`
3. `../backend/README.md`
4. `../shared/src/types.ts`

## 后端现在已经完成什么

不要重复实现以下能力：

- `/asr`：sherpa-onnx + SenseVoice 本地整段识别；
- `/candidates`：真实 OpenAI 兼容 LLM、profile 注入、输出清洗；
- LLM 失败时的 backend 模板兜底；
- `/tts`：msedge-tts、base64 MP3、磁盘缓存；
- `/profile`：JSON 文件持久化；
- profile 保存/启动时预生成紧急语和常用语；
- `/health`；
- shared 22 类场景模板。

尚未完成的是 **Even 插件侧的真实硬件链路**。

## 第一项任务

如果用户没有指定其他任务，第一项工作是：

> 以 Even 官方 `evenhub-templates/asr` 为底座，在本目录初始化最小运行时，
> 先完成 simulator HUD + backend `/health`，不要直接开始全链路。

必须使用当前官方文档确认 SDK 方法，不凭旧 API 名称猜测：

- <https://github.com/even-realities/evenhub-templates>
- <https://hub.evenrealities.com>

完成标准：

1. 新插件包可以安装依赖并构建；
2. simulator 显示“无声之声已连接”；
3. 手机伴随界面能配置 backend 地址；
4. `/health` 状态能显示；
5. 文档写明启动命令；
6. 不影响 `config-app/` 和 `glasses-app/`。

## 第二到第五项任务

按顺序推进，不能跳步：

1. 固定文本 → `/candidates` → HUD 四候选；
2. R1/模拟事件 → 高亮、确认、换批；
3. G2 PCM → `/asr` → `/candidates`；
4. `/tts` MP3 → 手机扬声器；
5. profile 手机控制页 + 断网兜底 + 延迟测试。

每完成一步都保留独立可演示状态。

## 技术约束

- 状态机固定为：
  `IDLE → LISTENING → THINKING → CANDIDATES → SPEAKING → IDLE`。
- 只使用 push-to-listen，不做常开麦。
- 候选恒为 4 条，每条目标 ≤12 字。
- SPEAKING 时停止采音。
- backend URL 从运行配置读取，真机使用 Mac 局域网 IP，不能使用 localhost。
- 所有 API Key 只在 `backend/.env`，不得进入插件或 Git。
- backend 不可达时，在插件本地调用 shared 模板库。
- `userId=demo` 足够比赛使用，不做账户系统。

## 音频约束

上传 `/asr`：

- PCM s16le
- 16 kHz
- mono
- base64
- 不带 WAV 头

播放 `/tts`：

- `audio` 是 base64 MP3
- `mime` 当前为 `audio/mpeg`
- 必须先在手机控制页通过用户点击解锁音频权限

如果音频格式发生变化，先更新：

1. `shared/src/types.ts`
2. `docs/接口契约.md`
3. backend 与插件实现

## 目录和 Git 约束

- 保留：
  - `config-app/`
  - `glasses-app/`
  - `even-hub-plugin/DEVELOPMENT.md`
  - `even-hub-plugin/AGENTS.md`
- 不提交：
  - `.env`、API Key、Token
  - ASR 模型
  - backend 本地 profile/TTS 缓存
  - `node_modules/`、`dist/`
  - `.ehpk`、录音和 APK
- 开始前检查 `git status`，不得覆盖其他 AI/队友的未提交修改。
- 当前协作分支是 `feat/b-profile-flow`，对应 Draft PR #1。
- 大改动继续通过 PR review，不直接合并 main。

## 每次交付前

当前后端检查：

```bash
npm --workspace backend test
npx tsc --noEmit -p backend/tsconfig.json
```

插件代码初始化后必须补充实际命令，并至少执行：

```bash
npm run build
```

如果改动影响旧工程，还要执行：

```bash
npm --workspace glasses-app run build
cd config-app && npm run typecheck
```

最终汇报必须明确区分：

- 浏览器/simulator 已验证；
- Even G2 真机已验证；
- R1 真机已验证；
- 仍属于假数据或降级路径。

