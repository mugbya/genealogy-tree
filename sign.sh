#!/bin/bash
set -e

echo "=== 祖谱软件签名脚本 ==="

# 进入项目根目录
cd "$(dirname "$0")"

# 检测构建产物路径
BUNDLE_PATH="src-tauri/target/release/bundle"
APP_PATH=""
DMG_PATH=""

# 查找 macOS app bundle
if [ -d "$BUNDLE_PATH/macos" ]; then
    APP_PATH=$(find "$BUNDLE_PATH/macos" -name "*.app" -type d 2>/dev/null | head -1)
fi

# 查找 DMG
if [ -d "$BUNDLE_PATH/dmg" ]; then
    DMG_PATH=$(find "$BUNDLE_PATH/dmg" -name "*.dmg" -type f 2>/dev/null | head -1)
fi

echo "检测到产物:"
[ -n "$APP_PATH" ] && echo "  App: $APP_PATH"
[ -n "$DMG_PATH" ] && echo "  DMG: $DMG_PATH"

# 签名函数
sign_app() {
    local app_path="$1"
    local identity="$2"

    if [ -z "$app_path" ] || [ ! -d "$app_path" ]; then
        echo "错误: App 路径不存在: $app_path"
        return 1
    fi

    echo "正在签名 App: $app_path"
    echo "使用签名标识: $identity"

    # 签名二进制文件
    codesign --force --deep --sign "$identity" "$app_path/Contents/MacOS/genealogy" 2>/dev/null || \
    codesign --force --sign "$identity" "$app_path/Contents/MacOS/genealogy" || true

    # 签名整个 app bundle
    codesign --force --deep --sign "$identity" "$app_path"

    if [ $? -eq 0 ]; then
        echo "签名成功: $app_path"
    else
        echo "签名失败或已跳过"
    fi
}

# DMG 签名函数
sign_dmg() {
    local dmg_path="$1"
    local identity="$2"

    if [ -z "$dmg_path" ] || [ ! -f "$dmg_path" ]; then
        echo "错误: DMG 路径不存在: $dmg_path"
        return 1
    fi

    echo "正在签名 DMG: $dmg_path"

    codesign --force --sign "$identity" "$dmg_path"

    if [ $? -eq 0 ]; then
        echo "签名成功: $dmg_path"
    else
        echo "签名失败或已跳过"
    fi
}

# 从钥匙串获取签名标识列表（用于调试）
list_identities() {
    echo "可用的签名标识:"
    security find-identity -v -p codesigning 2>/dev/null | grep -E "\(([^)]+)\)" | head -10
}

# 主流程
case "${1:-interactive}" in
    interactive)
        echo ""
        echo "请选择操作:"
        echo "  1. 签名 App"
        echo "  2. 签名 DMG"
        echo "  3. 签名 App + DMG"
        echo "  4. 查看可用签名标识"
        echo "  q. 退出"
        read -p "请输入选择 [1-4]: " choice

        case "$choice" in
            1)
                [ -n "$APP_PATH" ] && sign_app "$APP_PATH" "${SIGNING_IDENTITY:-}" || echo "未找到 App"
                ;;
            2)
                [ -n "$DMG_PATH" ] && sign_dmg "$DMG_PATH" "${SIGNING_IDENTITY:-}" || echo "未找到 DMG"
                ;;
            3)
                [ -n "$APP_PATH" ] && sign_app "$APP_PATH" "${SIGNING_IDENTITY:-}" || echo "未找到 App"
                [ -n "$DMG_PATH" ] && sign_dmg "$DMG_PATH" "${SIGNING_IDENTITY:-}" || echo "未找到 DMG"
                ;;
            4)
                list_identities
                ;;
            q|Q)
                echo "退出"
                exit 0
                ;;
            *)
                echo "无效选择: $choice"
                exit 1
                ;;
        esac
        ;;
    app)
        [ -n "$APP_PATH" ] && sign_app "$APP_PATH" "${SIGNING_IDENTITY:-}" || echo "未找到 App"
        ;;
    dmg)
        [ -n "$DMG_PATH" ] && sign_dmg "$DMG_PATH" "${SIGNING_IDENTITY:-}" || echo "未找到 DMG"
        ;;
    all)
        [ -n "$APP_PATH" ] && sign_app "$APP_PATH" "${SIGNING_IDENTITY:-}" || echo "未找到 App"
        [ -n "$DMG_PATH" ] && sign_dmg "$DMG_PATH" "${SIGNING_IDENTITY:-}" || echo "未找到 DMG"
        ;;
    list)
        list_identities
        ;;
    *)
        echo "用法: $0 [interactive|app|dmg|all|list]"
        echo ""
        echo "  interactive - 交互模式 (默认)"
        echo "  app         - 仅签名 App"
        echo "  dmg         - 仅签名 DMG"
        echo "  all         - 签名 App 和 DMG"
        echo "  list        - 列出可用签名标识"
        echo ""
        echo "环境变量:"
        echo "  SIGNING_IDENTITY - 指定签名标识（如 \"Apple Development: xxx\"）"
        exit 1
        ;;
esac

echo "=== 签名完成 ==="