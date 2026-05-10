import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./App.css";

// 隐藏 loading，显示 root
const hideLoading = () => {
  const loading = document.getElementById('loading');
  const root = document.getElementById('root');
  if (loading) loading.style.display = 'none';
  if (root) root.style.display = '';
};

// 更新加载状态文字
const updateLoadingText = (text: string) => {
  const el = document.getElementById('loading-text');
  if (el) el.textContent = text;
};

// 暴露给 window
(window as any).__updateLoadingText = updateLoadingText;
(window as any).__hideLoading = hideLoading;

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

// React 渲染完成后隐藏 loading
document.addEventListener('DOMContentLoaded', () => {
  setTimeout(() => {
    hideLoading();
  }, 100);
});
