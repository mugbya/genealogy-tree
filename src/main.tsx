import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./App.css";

// 立即显示 loading spinner，不等待 React 水合
const root = document.getElementById("root") as HTMLElement;
if (root) {
  root.innerHTML = `
    <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 100vh; background: #fafafa; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;">
      <div style="width: 48px; height: 48px; border: 4px solid #e4e4e7; border-top-color: #6366f1; border-radius: 50%; animation: spin 0.8s linear infinite;"></div>
      <p id="loading-text" style="margin-top: 16px; color: #666; font-size: 14px;">加载中...</p>
    </div>
    <style>@keyframes spin { to { transform: rotate(360deg); } }</style>
  `;

  // 更新加载状态
  const updateLoadingText = (text: string) => {
    const el = document.getElementById('loading-text');
    if (el) el.textContent = text;
  };

  (window as any).__updateLoadingText = updateLoadingText;
}

ReactDOM.createRoot(root).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
