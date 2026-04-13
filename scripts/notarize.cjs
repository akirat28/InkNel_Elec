#!/usr/bin/env node
/**
 * electron-builder の afterSign フック: ビルドされた .app を
 * Apple に提出して公証 (Notarization) を受ける。
 *
 * 公証済みの .app はダウンロード後に Gatekeeper 警告なしで開ける。
 *
 * 必要な環境変数:
 *   APPLE_ID             Apple ID のメールアドレス
 *   APPLE_APP_PASSWORD   App 用パスワード (https://appleid.apple.com で生成)
 *   APPLE_TEAM_ID        Developer Team ID (任意。package.json から自動取得もする)
 */
const { notarize } = require('@electron/notarize');
const path = require('node:path');

exports.default = async function notarizing(context) {
  if (context.electronPlatformName !== 'darwin') return;

  const appleId = process.env.APPLE_ID;
  const appleIdPassword = process.env.APPLE_APP_PASSWORD;
  const teamId = process.env.APPLE_TEAM_ID || 'F3P687R953';

  if (!appleId || !appleIdPassword) {
    console.warn(
      '[notarize] APPLE_ID / APPLE_APP_PASSWORD 環境変数が未設定のため Notarization をスキップします。',
    );
    console.warn(
      '[notarize] 環境変数を設定して再ビルドすると Gatekeeper 警告なしで配布できます。',
    );
    return;
  }

  const appName = context.packager.appInfo.productFilename;
  const appPath = path.join(context.appOutDir, `${appName}.app`);

  console.log(`[notarize] Apple Notarization を開始: ${appPath}`);
  console.log(`[notarize] Apple ID: ${appleId}`);
  console.log(`[notarize] Team ID: ${teamId}`);

  try {
    await notarize({
      appPath,
      appleId,
      appleIdPassword,
      teamId,
    });
    console.log('[notarize] Notarization 完了。');
  } catch (err) {
    console.error('[notarize] Notarization に失敗しました:', err.message || err);
    throw err;
  }
};
