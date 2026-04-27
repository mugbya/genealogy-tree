use axum::{
    extract::{Path, Extension},
    http::{header, StatusCode},
    response::Response,
};
use tauri::Manager;

/// 下载模板文件
pub async fn download_template(
    Path(template_name): Path<String>,
    Extension(app): Extension<tauri::AppHandle>,
) -> Result<Response, StatusCode> {
    // 安全检查：只允许特定的模板文件名
    let allowed_templates = ["hongloujia_template.csv", "kongzishi_template.csv"];
    if !allowed_templates.contains(&template_name.as_str()) {
        return Err(StatusCode::NOT_FOUND);
    }

    // 获取资源目录路径（Tauri 打包后的资源位置）
    let resource_dir = app.path().resource_dir().map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    let template_path = resource_dir.join("templates").join(&template_name);

    eprintln!("[template] Looking for template at: {:?}", template_path);

    // 读取文件
    let content = tokio::fs::read(&template_path)
        .await
        .map_err(|e| {
            eprintln!("[template] Failed to read template: {}", e);
            StatusCode::INTERNAL_SERVER_ERROR
        })?;

    // 确定文件名
    let download_filename = match template_name.as_str() {
        "hongloujia_template.csv" => "红楼梦贾家导入模板.csv",
        "kongzishi_template.csv" => "孔子世家导入模板.csv",
        _ => &template_name,
    };

    // 构建响应
    let mut response = Response::new(content.into());
    response.headers_mut().insert(
        header::CONTENT_TYPE,
        "text/csv; charset=utf-8".parse().unwrap(),
    );
    response.headers_mut().insert(
        header::CONTENT_DISPOSITION,
        format!("attachment; filename=\"{}\"; filename*=UTF-8''{}",
            download_filename, download_filename).parse().unwrap(),
    );

    Ok(response)
}
