import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './styles/global.css';

// ===== ランタイムロードされるプラグイン用に React API を window に露出 =====
// 通常 `import React from 'react'` は Vite が解決するが、ランタイムプラグインは
// `inknel-plugin://...` 経由でロードされるため Vite の解決対象外。
// プラグインは `const { React, useState, ... } = window.InkNelPluginAPI` で
// 必要なフックを取り出せる。
//
// (window as any) は型定義を緩めるための一時キャスト。
(window as unknown as { InkNelPluginAPI: unknown }).InkNelPluginAPI = {
  React,
  // よく使うフック
  useState: React.useState,
  useEffect: React.useEffect,
  useMemo: React.useMemo,
  useCallback: React.useCallback,
  useRef: React.useRef,
  // JSX 風の便利関数（プラグイン側で使いやすいよう createElement のエイリアス）
  h: React.createElement,
  Fragment: React.Fragment,
};

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
