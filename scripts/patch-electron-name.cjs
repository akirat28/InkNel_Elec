#!/usr/bin/env node
/**
 * 開発時の Electron.app の Info.plist を書き換えて、
 * macOS のアプリメニュー名を "InkNel" に変更する。
 *
 * 背景: macOS のメニューバー左上のアプリ名は、実行している .app バンドルの
 * Info.plist の CFBundleName から決まる。Electron 開発時は
 * node_modules/electron/dist/Electron.app をそのまま起動するため、
 * app.setName() や Menu テンプレートでは上書きできない。
 *
 * このスクリプトは postinstall と predev で自動実行され、
 * Electron.app の CFBundleName / CFBundleDisplayName を書き換える。
 * （node_modules 内の変更なので、依存再インストール時に再パッチが必要）
 */
const { execSync } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');

const APP_NAME = 'InkNel';

if (process.platform !== 'darwin') {
  // macOS 以外では何もしない
  process.exit(0);
}

const electronAppPath = path.join(
  __dirname,
  '..',
  'node_modules',
  'electron',
  'dist',
  'Electron.app',
);
const infoPlist = path.join(electronAppPath, 'Contents', 'Info.plist');

if (!fs.existsSync(infoPlist)) {
  console.warn(
    `[patch-electron-name] ${infoPlist} が見つかりません。スキップします。`,
  );
  process.exit(0);
}

function setPlistKey(key, value) {
  try {
    execSync(
      `/usr/libexec/PlistBuddy -c 'Set :${key} ${value}' "${infoPlist}"`,
      { stdio: 'pipe' },
    );
  } catch {
    execSync(
      `/usr/libexec/PlistBuddy -c 'Add :${key} string ${value}' "${infoPlist}"`,
      { stdio: 'pipe' },
    );
  }
}

setPlistKey('CFBundleName', APP_NAME);
setPlistKey('CFBundleDisplayName', APP_NAME);

console.log(`[patch-electron-name] Electron.app を "${APP_NAME}" に書き換えました`);
