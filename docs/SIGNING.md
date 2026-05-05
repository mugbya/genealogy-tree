# 软件签名流程

## 概述

发布更新前需要对 DMG 文件进行签名，以确保更新推送功能正常工作。

## 前置条件

1. 已在 `.tauri/` 目录下准备好签名密钥：
   - `.tauri/keys` - 私钥文件（加密）
   - `.tauri/keys.pub` - 公钥文件

2. `tauri.conf.json` 中的 `pubkey` 已配置对应的公钥

## 签名步骤

### 1. 编译打包

```bash
./build.sh
```

构建产物位于：
- App: `src-tauri/target/release/bundle/macos/genealogy.app`
- DMG: `src-tauri/target/release/bundle/dmg/genealogy_1.0.0_aarch64.dmg`

### 2. 对 DMG 进行签名

```bash
pnpm tauri signer sign -f .tauri/keys -p <密码> src-tauri/target/release/bundle/dmg/genealogy_1.0.0_aarch64.dmg
```

签名成功后会在同级目录生成 `.sig` 文件：
```
src-tauri/target/release/bundle/dmg/genealogy_1.0.0_aarch64.dmg.sig
```

终端会输出公钥签名，类似：
```
Public signature:
dW50cnVzdGVkIGNvbW1lbnQ6IHNpZ25hdHVyZSBmcm9tIHRhdXJpIHNlY3JldCBrZXkK...
```

### 3. 上传文件到 COS

1. 上传 DMG 文件到更新服务器：
   ```
   <COS_BUCKET_URL>/updates/genealogy_1.0.0_aarch64.dmg
   ```

2. 上传 `.sig` 签名文件到同一目录

### 4. 更新 latest.json

在更新服务器的 `updates/` 目录下创建或更新 `latest.json`：

```json
{
  "version": "1.0.0",
  "date": "2026-05-05",
  "body": "更新说明...",
  "path": "<COS_BUCKET_URL>/updates/genealogy_1.0.0_aarch64.dmg",
  "signature": "上一步得到的公钥签名字符串"
}
```

## 重置签名密钥

如果忘记了私钥密码，需要重新生成密钥：

```bash
pnpm tauri signer generate
```

新密钥生成后需要：
1. 更新 `tauri.conf.json` 中的 `pubkey` 为新的公钥
2. 重新编译打包
3. 使用新密钥签名

## 签名验证

签名会自动被 Tauri 的 updater 插件验证，无需手动验证。

---

最后更新: 2026-05-05