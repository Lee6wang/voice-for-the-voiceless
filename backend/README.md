# backend · 薄云后端（B）

配置存储 + 受约束 Candidate Agent。Even Hub 插件只调用这里，**API 密钥只在本服务的 `.env`，绝不进仓库**。

## 接口（详见 `../docs/接口契约.md` §3）
- `POST /asr` — sherpa-onnx + SenseVoice 离线语音识别
- `POST /candidates` — 召回会话/行为记忆后生成个性化候选，失败走模板库
- `POST /agent/feedback` — 幂等记录候选反馈；只有成功播放形成长期偏好
- `POST /tts` — msedge-tts 中文语音合成，带磁盘缓存
- `GET/POST /profile` — JSON 文件持久化的个性化配置
- `GET /health` — 检查 backend、LLM 配置和 ASR 模型状态

Agent 记忆保存在 `backend/data/memory.sqlite`（已忽略，不进 Git）：

- 原始音频不保存。
- 短期会话转写默认保留 24 小时，可用 `MEMORY_SESSION_TTL_HOURS` 调整。
- 长期偏好只从用户成功说出的短句、模式和粗粒度场景/对象派生。
- 每轮最多一次 LLM 调用；记忆故障不影响原模板兜底。

## 启动
```bash
# 在仓库根执行一次
npm install
# 复制配置样例；LLM_API_KEY 留空时 /candidates 自动走模板库
test -f backend/.env || cp backend/env.example backend/.env
# 起服务
npm run dev:backend            # 或：npm --workspace backend run dev
```

离线 ASR 首次使用前需下载本地模型，见
[`models/README.md`](models/README.md)。模型不进入 Git。
默认监听 `0.0.0.0:8787`：

- Mac 本机访问：`http://localhost:8787`
- Android Emulator 访问：`http://10.0.2.2:8787`
- 同一局域网的手机/眼镜访问：`http://<Mac 局域网 IP>:8787`

例如 Mac 地址是 `192.168.1.10`，设备端应填写：

```text
http://192.168.1.10:8787
```

启动前可用下面的命令查询 Wi-Fi 地址：

```bash
ipconfig getifaddr en0
```

如果局域网设备无法连接：

1. 确认设备与 Mac 位于同一个 Wi-Fi/热点。
2. 在设备浏览器打开
   `http://<Mac IP>:8787/profile?userId=demo` 测试。
3. macOS 弹出网络访问提示时，允许 Node 接收入站连接。
4. 确认路由器没有开启“客户端隔离”。

如只想允许本机访问，可覆盖监听地址：

```bash
HOST=127.0.0.1 npm run dev:backend
```

> 当前 Demo 接口没有鉴权且允许跨域，只适合可信局域网。不要设置公网端口映射，也不要直接暴露在公共 Wi-Fi。

## 当前完成度

- [x] `/candidates` 注入 profile，清洗为恰好 4 条且每条 ≤12 字
- [x] LLM 未配置、超时或输出异常时回退模板库
- [x] `/asr` 接入本地 SenseVoice 整段识别
- [x] `/tts` 返回 base64 MP3，并缓存已生成语音
- [x] profile 保存到 `backend/data/profiles.json`
- [x] 保存/启动时预生成紧急表达与常用表达的 TTS 缓存
- [x] SQLite 持久化最近会话和成功行为记忆
- [x] 行为反馈 eventId 幂等，未完成播放不会被学习
- [x] 记忆按场景/对象/模式过滤后注入 Candidate Agent
- [ ] 用 Even G2 输出的真实 PCM 做 ASR 兼容性和延迟测试
- [ ] 验证 Even Hub 插件在手机控制页面播放返回的 MP3
- [ ] 添加完整接口集成测试与请求并发保护

> 兜底说明：backend 侧 LLM 失败会自动走 `@vftv/shared` 的模板库；**backend 完全不可达时的兜底必须在 Even Hub 插件端**（见接口契约 §3.2）。
