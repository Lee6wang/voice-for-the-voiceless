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
# 配置密钥
cp .env.example backend/.env   # 填入 ASR/LLM/TTS 的 key
# 起服务
npm run dev:backend            # 或：npm --workspace backend run dev
```
默认 `http://localhost:8787`。

## 待办（B）
- [ ] `/candidates` 拼 prompt（注入 profile）+ 接云 LLM，解析出 4 条 ≤12 字
- [ ] `/asr` 接云流式/整段识别
- [ ] `/tts` 接云合成，返回 base64
- [ ] 密钥读取与各 provider 适配（讯飞/阿里云/DeepSeek/通义/Edge-TTS）

> 兜底说明：backend 侧 LLM 失败会自动走 `@vftv/shared` 的模板库；**断网兜底在 glasses-app 插件端**（见接口契约 §3.2）。
