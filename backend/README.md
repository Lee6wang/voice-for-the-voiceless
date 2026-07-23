# backend · 薄云后端（B）

配置存储 + 云 API 密钥代理。glasses-app 只调这里，**API 密钥只在本服务的 `.env`，绝不进仓库**。

## 接口（详见 `../docs/接口契约.md` §3）
- `POST /asr` — 语音转文字（现为 mock，TODO 接云 ASR）
- `POST /candidates` — 生成候选（已接**模板库兜底**；TODO 接云 LLM）
- `POST /tts` — 文字转语音（现为 mock，TODO 接云 TTS）
- `GET/POST /profile` — 个性化配置读写（内存存储）

## 启动
```bash
# 在仓库根执行一次
npm install
# 当前 mock 无需密钥；接入云 API 后再创建 backend/.env
# 起服务
npm run dev:backend            # 或：npm --workspace backend run dev
```
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

## 待办（B）
- [ ] `/candidates` 拼 prompt（注入 profile）+ 接云 LLM，解析出 4 条 ≤12 字
- [ ] `/asr` 接云流式/整段识别
- [ ] `/tts` 接云合成，返回 base64
- [ ] 密钥读取与各 provider 适配（讯飞/阿里云/DeepSeek/通义/Edge-TTS）

> 兜底说明：backend 侧 LLM 失败会自动走 `@vftv/shared` 的模板库；**断网兜底在 glasses-app 插件端**（见接口契约 §3.2）。
