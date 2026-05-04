#!/bin/bash
set -e

echo "=== 祖谱软件编译脚本 ==="

# 进入项目根目录
cd "$(dirname "$0")"

# 1. 清理 dist 目录（确保前端资源是最新的）
echo "[1/3] 清理 dist 目录..."
rm -rf dist

# 2. 构建前端
echo "[2/3] 构建前端..."
pnpm build

# 3. 构建 Tauri 应用
echo "[3/3] 构建 Tauri 应用..."
pnpm tauri build

echo "=== 编译完成 ==="
