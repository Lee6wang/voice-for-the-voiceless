# config-app · 独立配置 App（B）

React Native + Expo（TypeScript）。录入名字、常用表达、语气与紧急表达，
保存到 backend `/profile`，供 glasses-app 在会话开始时读取。

> 本目录不纳入根 npm workspaces，依赖与 lockfile 独立管理。

## 本地启动

先在另一个终端启动仓库根目录的 backend：

```bash
npm run dev:backend
```

再启动配置 App：

```bash
cd config-app
npm install
npm run android
```

也可以执行 `npm start`，然后按 `a` 打开 Android Emulator。

## 后端地址

默认地址是 `http://10.0.2.2:8787`，适用于 Android Emulator 访问宿主 Mac。

真机或远程后端通过 Expo 公共环境变量覆盖：

```bash
EXPO_PUBLIC_BACKEND_URL=http://192.168.1.10:8787 npm start
```

不要把 API 密钥放进 `EXPO_PUBLIC_*`；客户端只保存 backend 地址。

## 当前功能

- 启动时通过 `GET /profile?userId=demo` 读取已有配置
- 编辑名字、常用表达、语气和紧急表达
- 通过 `POST /profile` 保存并显示成功/失败状态
- Demo 阶段固定使用 `userId=demo`

## 下一步

- [ ] 与真机联调后端地址
- [ ] 增加表单输入校验
- [ ] 有余量时再做二维码或登录绑定
