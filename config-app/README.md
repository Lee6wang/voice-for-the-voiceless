# config-app · 独立配置 App（B）

> **保留/冻结（2026-07-24）：**本 App 已在安卓模拟器跑通，必须保留作为备用
> 配置入口，但不再是主客户端。新的主流程改由
> `../even-hub-plugin/` 的手机控制页 + 眼镜 HUD 完成。在主插件闭环前不继续扩展
> 登录、iOS 发布或视觉细节。

React Native + Expo（TypeScript）。录入名字、常用表达、语气与紧急表达，
保存到 backend `/profile`，供 Even Hub 插件在会话开始时读取。

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

## Android Studio

Node 通过 NVM 安装时，从 Finder 启动的 Android Studio 可能找不到 `node`，
表现为 Gradle Sync 报错 `A problem occurred starting process 'command node'`。

首次使用先生成仅保存在本机的原生工程：

```bash
npx expo prebuild --platform android --no-install
```

之后完全退出 Android Studio，再从本目录执行：

```bash
npm run studio
```

该命令会把当前终端的 Node 路径和 Android Studio 内置 JDK 显式传给 IDE。
同步完成后，顶部会出现 `app` 运行配置。

## 后端地址

默认地址是 `http://10.0.2.2:8787`，适用于 Android Emulator 访问宿主 Mac。

真机或远程后端通过 Expo 公共环境变量覆盖：

```bash
EXPO_PUBLIC_BACKEND_URL=http://192.168.1.10:8787 npm start
```

不要把 API 密钥放进 `EXPO_PUBLIC_*`；客户端只保存 backend 地址。

也可以在本目录创建不会提交到 Git 的 `.env.local`：

```dotenv
EXPO_PUBLIC_BACKEND_URL=http://<Mac 局域网 IP>:8787
```

Mac 更换 Wi-Fi 或热点后，局域网 IP 可能变化，需要同步修改该文件并重启 Expo。

## 当前功能

- 启动时通过 `GET /profile?userId=demo` 读取已有配置
- 编辑名字、常用表达、语气和紧急表达
- 通过 `POST /profile` 保存并显示成功/失败状态
- Demo 阶段固定使用 `userId=demo`

## 下一步

- [ ] 与真机联调后端地址
- [ ] 增加表单输入校验
- [ ] 有余量时再做二维码或登录绑定
