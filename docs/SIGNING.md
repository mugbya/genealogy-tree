# 软件签名流程

## 概述

发布更新前需要对 DMG 文件进行签名，以确保更新推送功能正常工作。

## 前置条件

1. 使用 `pnpm tauri signer generate` 生成签名密钥对：
   - `.tauri/keys` - 私钥文件（加密）
   - `.tauri/keys.pub` - 公钥文件

2. `tauri.conf.json` 中的 `pubkey` 已配置对应的公钥

3. 安装 `direnv` 并配置（用于安全管理私钥密码）

## 使用 direnv 管理签名密码

### 1. 安装 direnv

```bash
# macOS
brew install direnv

# Linux
sudo apt install direnv
```

### 2. 配置 shell

在 `~/.zshrc` 或 `~/.bashrc` 中添加：
```bash
eval "$(direnv hook zsh)"  # zsh
# 或
eval "$(direnv hook bash)" # bash
```


### 3. 创建 .envrc

在项目根目录创建 `.envrc`：

```bash
export TAURI_SIGNING_PRIVATE_KEY="$(cat .tauri/keys)"
```

### 4. 允许 direnv

```bash
direnv allow .
```

之后签名时会自动加载密码，无需手动输入。

## 签名步骤

### 1. 编译打包 

```bash
./build.sh
```
> 现在因为在 tauri.conf.json 增加了 "createUpdaterArtifacts": true, 会自动签名

构建产物位于：
- App: `src-tauri/target/release/bundle/macos/genealogy.app`
- DMG: `src-tauri/target/release/bundle/dmg/genealogy_1.0.0_aarch64.dmg`
- 更新文件: `src-tauri/target/release/bundle/macos/genealogy.app.tar.gz (updater)`
- 签名文件: `src-tauri/target/release/bundle/macos/genealogy.app.tar.gz.sig`

### 2. 对 DMG 进行签名

现在已不需要单独进行签名了

最后更新: 2026-05-06