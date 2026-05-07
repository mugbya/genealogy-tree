# 授权功能配置

系统中的授权功能按钮（如"导出HTML"、"分册导出"、"截图下载"等）通过以下配置进行管理：

## 当前已授权功能

| 功能名称 | 显示名称 | 说明 | 前端位置 |
|---------|---------|------|---------|
| export_html | HTML导出 | 导出族谱为HTML格式 | ModernGenealogyBook |
| export_word | Word导出 | 导出族谱为Word格式 | ModernGenealogyBook |
| export_volume | 分册导出 | 分册导出族谱 | ModernGenealogyBook |
| export_screenshot | 截图下载 | 族谱树截图下载 | TreePage |

## 配置位置

1. **后端功能定义**：`src-tauri/src/license.rs`
   - `LicenseFeature` 枚举：定义需要授权的功能
   - `all_features()` 方法：返回功能列表及其元数据
   - `check_feature` handler：检查功能授权状态

2. **前端UI**：各页面组件（如 `TreePage.tsx`、`ModernGenealogyBook.tsx`）
   - 需要在组件中调用 `licenseApi.checkFeature()` 检查授权
   - 根据授权状态禁用/启用功能按钮

## 添加新功能

1. 在 `license.rs` 中添加新的 `LicenseFeature`：
   ```rust
   pub enum LicenseFeature {
       ExportHtml,
       ExportWord,
       ExportVolume,
       ExportScreenshot,
       YourNewFeature,  // 添加新功能
   }

   // 在 requires_license() 中添加：
   LicenseFeature::YourNewFeature => true,

   // 在 all_features() 中添加：
   FeatureInfo {
       name: "your_new_feature".to_string(),
       display_name: "新功能".to_string(),
       description: "功能描述".to_string(),
   }

   // 在 from_name() 中添加：
   "your_new_feature" => Some(LicenseFeature::YourNewFeature),
   ```

2. 在 `src-tauri/src/api/handlers/license.rs` 的 `check_feature` handler 中添加对新功能的处理

3. 在前端对应的页面中添加授权检查：
   ```typescript
   const [canUseFeature, setCanUseFeature] = useState(true)

   useEffect(() => {
     const checkAuth = async () => {
       const result = await licenseApi.checkFeature('your_new_feature')
       setCanUseFeature(result.data?.allowed ?? false)
     }
     checkAuth()
   }, [])

   // 在按钮中添加：
   <Button disabled={!canUseFeature}>新功能</Button>
   ```

## 移除功能

1. 在 `license.rs` 中移除对应的枚举值和方法中的条目
2. 在 `check_feature` handler 中移除对应的处理
3. 移除前端对应的授权检查代码和按钮

## 注意事项

- 功能名称（如 `export_html`）必须与后端 `LicenseFeature` 中定义的一致
- 前端各组件需要自行调用 `licenseApi.checkFeature()` 检查授权
- 授权状态存储在数据库的 license 表中
