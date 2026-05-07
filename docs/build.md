# 构建说明

## Windows 构建

### 1. PowerShell 脚本编码

**重要**：Windows 上 PowerShell 脚本需要保存为 **UTF-8 with BOM** 编码，否则中文会乱码。

操作步骤：
1. 用 VS Code 或记事本打开 `build.ps1`
2. 选择"文件" -> "另存为"
3. 在编码下拉框中选择 **UTF-8 with BOM**
4. 保存文件

### 2. 设置签名私钥环境变量

构建 Tauri 应用需要设置签名私钥：

```powershell
# 临时设置（只对当前会话有效）
$env:TAURI_SIGNING_PRIVATE_KEY = "你的私钥内容"

# 永久设置（需要管理员权限）
[System.Environment]::SetEnvironmentVariable("TAURI_SIGNING_PRIVATE_KEY", "你的私钥内容", "User")
```

或者创建 `.env` 文件（推荐）：

```powershell
# 在项目根目录创建 .env 文件
"TAURI_SIGNING_PRIVATE_KEY=你的私钥内容" | Out-File -FilePath ".env" -Encoding UTF8
```

**验证变量是否设置成功：**

```powershell
# 查看当前会话的变量
$env:TAURI_SIGNING_PRIVATE_KEY

# 检查是否为空
if ($env:TAURI_SIGNING_PRIVATE_KEY) {
    Write-Host "已设置，长度: $($env:TAURI_SIGNING_PRIVATE_KEY.Length)"
} else {
    Write-Host "未设置"
}

# 查看永久设置（需要管理员权限）
[System.Environment]::GetEnvironmentVariable("TAURI_SIGNING_PRIVATE_KEY", "User")
```

### 3. 安装依赖

```powershell
# 安装 pnpm（如果未安装）
npm install -g pnpm

# 安装项目依赖
pnpm install
```

### 4. 执行构建

```powershell
# 方式1：使用 PowerShell 脚本（需先设置编码为 UTF-8 with BOM）
.\build.ps1

# 方式2：直接使用 pnpm 命令
pnpm build
pnpm tauri build
```

---

## macOS / Linux 构建

```bash
# 安装依赖
pnpm install

# 构建
./build.sh
```

---

## 常见问题

### Q: Windows 上中文显示乱码

A: 需要将 `build.ps1` 文件保存为 **UTF-8 with BOM** 编码。VS Code 操作：文件 -> 另存为 -> 选择 UTF-8 with BOM。

### Q: 构建失败提示找不到模块

A: 先运行 `pnpm install` 安装依赖。

### Q: Tauri 签名失败

A: 确保已正确设置 `TAURI_SIGNING_PRIVATE_KEY` 环境变量。
