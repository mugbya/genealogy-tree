#!/usr/bin/env python3
"""
Tauri 图标生成器
为 genealogy 项目生成所有需要的图标
"""

from PIL import Image
import os
import sys

def generate_tauri_icons(source_image, output_dir="src-tauri/icons"):
    """生成 Tauri 所需的所有图标"""

    os.makedirs(output_dir, exist_ok=True)

    # 打开源图片
    img = Image.open(source_image)
    print(f"✅ 源图片: {source_image}")
    print(f"   尺寸: {img.size[0]} x {img.size[1]}")

    # 确保是正方形
    if img.size[0] != img.size[1]:
        size = min(img.size)
        left = (img.size[0] - size) // 2
        top = (img.size[1] - size) // 2
        img = img.crop((left, top, left + size, top + size))
        print(f"   已裁剪为正方形: {size}x{size}")

    # Tauri 需要的 PNG 尺寸
    icon_sizes = [32, 128, 256, 512]

    print(f"\n📦 生成 PNG 图标...")
    for size in icon_sizes:
        output_path = os.path.join(output_dir, f"{size}x{size}.png")
        resized = img.resize((size, size), Image.Resampling.LANCZOS)
        resized.save(output_path, "PNG", quality=95)
        print(f"   ✅ {size}x{size}.png")

    # 生成主图标
    main_icon_path = os.path.join(output_dir, "icon.png")
    icon_512 = img.resize((512, 512), Image.Resampling.LANCZOS)
    icon_512.save(main_icon_path, "PNG", quality=95)
    print(f"   ✅ icon.png (512x512)")

    # 生成 Windows ICO
    print(f"\n🪟 生成 Windows ICO 图标...")
    ico_sizes = [32, 64, 128, 256]
    ico_images = []
    for size in ico_sizes:
        resized = img.resize((size, size), Image.Resampling.LANCZOS)
        if resized.mode != 'RGBA':
            resized = resized.convert('RGBA')
        ico_images.append(resized)

    ico_path = os.path.join(output_dir, "icon.ico")
    ico_images[0].save(ico_path, format='ICO', sizes=[(s, s) for s in ico_sizes])
    print(f"   ✅ icon.ico")

    # 生成 macOS ICNS
    print(f"\n🍎 生成 macOS ICNS 图标...")
    iconset_dir = os.path.join(output_dir, "icon.iconset")
    os.makedirs(iconset_dir, exist_ok=True)

    icns_sizes = {
        '16x16': 16, '16x16@2x': 32,
        '32x32': 32, '32x32@2x': 64,
        '128x128': 128, '128x128@2x': 256,
        '256x256': 256, '256x256@2x': 512,
        '512x512': 512, '512x512@2x': 1024,
    }

    for name, size in icns_sizes.items():
        output_path = os.path.join(iconset_dir, f"icon_{name}.png")
        resized = img.resize((size, size), Image.Resampling.LANCZOS)
        resized.save(output_path, "PNG")

    # 使用 iconutil 生成 icns（macOS）
    icns_path = os.path.join(output_dir, "icon.icns")
    result = os.system(f"iconutil -c icns '{iconset_dir}' -o '{icns_path}' 2>/dev/null")
    if result == 0:
        print(f"   ✅ icon.icns")
        # 清理临时目录
        import shutil
        shutil.rmtree(iconset_dir)
    else:
        print(f"   ⚠️  ICNS 生成失败，请手动运行: iconutil -c icns {iconset_dir}")

    print(f"\n✅ 所有图标已生成到: {output_dir}/")
    return output_dir

if __name__ == "__main__":
    # 使用项目中的 app-icon.png
    source = "src-tauri/icons/app-icon.png"

    if not os.path.exists(source):
        print(f"❌ 找不到源图片: {source}")
        print("请确保 src-tauri/icons/app-icon.png 存在")
        sys.exit(1)

    print("🎨 Tauri 图标生成器 - genealogy 项目\n")
    generate_tauri_icons(source)
