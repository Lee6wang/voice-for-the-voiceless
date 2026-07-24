# ASR 模型目录

`/asr` 使用 sherpa-onnx + SenseVoice 端侧离线识别（免密钥、断网可用）。
模型不入库，首次部署需手动下载。完整解压目录约 1.1GB，其中运行时实际使用
`model.int8.onnx`（约 240MB）和 `tokens.txt`：

```bash
cd backend/models
curl -sL -o sensevoice.tar.bz2 \
  https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/sherpa-onnx-sense-voice-zh-en-ja-ko-yue-2024-07-17.tar.bz2
tar xjf sensevoice.tar.bz2 && rm sensevoice.tar.bz2
```

完成后 `GET /health` 的 `asr` 字段应为 `true`。
未下载时 `/asr` 返回 503 与明确错误信息（不会返回假文本）。
