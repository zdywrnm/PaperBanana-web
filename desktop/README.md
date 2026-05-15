# PaperBanana Desktop

这是 PaperBanana 的 Windows 桌面客户端。第一版采用 Electron 桌面壳，直接加载线上站点：

```text
https://paperbanana.asia/
```

这样用户安装 `.exe` 后可以像普通桌面软件一样打开 PaperBanana，同时生成任务、登录、任务记录和图片保存仍然复用现有 Sealos / Laf / Better Auth 后端。

## 本地运行

```bash
cd desktop
npm ci
npm run dev
```

如果需要临时加载测试地址：

```bash
PAPERBANANA_DESKTOP_URL=http://127.0.0.1:5173 npm run dev
```

## Windows 打包

Windows 安装包由 GitHub Actions 在 Windows runner 上生成：

```bash
cd desktop
npm ci
npm run build:win
```

产物路径：

```text
desktop/release/PaperBanana-Setup-0.1.0.exe
```

## 发布

推送 `desktop-v*` 标签会触发 `.github/workflows/build-desktop.yml`，自动构建 Windows 安装包并上传到 GitHub Release。
