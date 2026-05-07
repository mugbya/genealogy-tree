#!/usr/bin/env pwsh
$ErrorActionPreference = "Stop"

Write-Host "=== 祖谱软件编译脚本 ===" -ForegroundColor Cyan

# 进入项目根目录
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $ScriptDir

# 1. 清理 dist 目录（确保前端资源是最新的）
Write-Host "[1/3] 清理 dist 目录..." -ForegroundColor Yellow
if (Test-Path "dist") {
    Remove-Item -Recurse -Force "dist"
}

# 2. 构建前端
Write-Host "[2/3] 构建前端..." -ForegroundColor Yellow
pnpm build

# 3. 构建 Tauri 应用
Write-Host "[3/3] 构建 Tauri 应用..." -ForegroundColor Yellow
pnpm tauri build

Write-Host "=== 编译完成 ===" -ForegroundColor Green
