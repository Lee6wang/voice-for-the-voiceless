# config-app · 独立配置 App（B）

React Native + Expo（TypeScript）。录入个性化配置（名字/常用语/语气/紧急语）→ 保存到 `backend /profile`，glasses-app 会读取。

> ⚠️ 本目录**不纳入根 npm workspaces**（Expo 自管依赖，避免 monorepo hoisting 问题）。单独安装运行。

## 初始化（首次）
```bash
cd config-app
# 在当前目录生成 Expo(TS) 工程；App.tsx 已提供，生成后用本目录的 App.tsx 覆盖它
npx create-expo-app@latest . -t expo-template-blank-typescript
# 覆盖后启动
npx expo start        # 手机装 Expo Go 扫码即跑
```

## 说明
- `App.tsx`（已提供起步版）：一个配置表单，保存时 `POST BACKEND/profile`。
- 后端地址 `BACKEND` 在 `App.tsx` 顶部，真机联调改成后端可达地址（同网 IP / 内网穿透）。
- 字段结构对应 `@vftv/shared` 的 `UserProfile`；因本工程独立，采用内联同构定义（就一个结构）。若想共享类型，可配置 metro `watchFolders` 指向 `../shared`（可选，非必需）。

## 待办（B）
- [ ] 生成 Expo 工程并跑通表单
- [ ] `POST /profile` 联调（与 backend）
- [ ] userId 绑定（Demo 用固定 `demo` 即可；有余量再做二维码/登录）
