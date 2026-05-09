/**
 * ダウンロードしたプラグインの manifest を保存するディレクトリ。
 *
 * 場所: `<appData>/InkNel/plugins/`
 * - macOS: `~/Library/Application Support/InkNel/plugins/`
 * - Windows: `%APPDATA%\InkNel\plugins\`
 * - Linux: `~/.config/InkNel/plugins/`
 *
 * `app.getPath('userData')` ではなく `appData + 'InkNel'` を明示指定することで、
 * `npm run dev` 起動時に `app.setName()` の評価タイミング次第で
 * Electron/plugins/ 等にズレるのを防いでいる。
 *
 * 現状は manifest JSON とプラグイン本体ファイルを置くだけで、
 * ランタイム実行は将来作業。
 */

import { app } from 'electron';
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';

const APP_FOLDER_NAME = 'InkNel';

let cached: string | null = null;

export function getPluginsDir(): string {
  if (cached) return cached;
  const dir = join(app.getPath('appData'), APP_FOLDER_NAME, 'plugins');
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  cached = dir;
  return dir;
}

/** plugins ディレクトリ配下の **全** ファイル名一覧（DL 状態判定用） */
export function listLocalFiles(): string[] {
  const dir = getPluginsDir();
  if (!existsSync(dir)) return [];
  return readdirSync(dir);
}

/** plugins ディレクトリ配下の `.json` ファイル一覧を中身付きで返す。 */
export function listLocalPluginManifests(): Array<{
  filename: string;
  content: unknown;
}> {
  const dir = getPluginsDir();
  if (!existsSync(dir)) return [];
  const entries = readdirSync(dir).filter((n) => n.toLowerCase().endsWith('.json'));
  const result: Array<{ filename: string; content: unknown }> = [];
  for (const filename of entries) {
    try {
      const raw = readFileSync(join(dir, filename), 'utf-8');
      result.push({ filename, content: JSON.parse(raw) });
    } catch {
      // 壊れたファイルは無視
    }
  }
  return result;
}

/** 指定ファイル名で manifest JSON を保存。既存は上書き。 */
export function savePluginManifest(filename: string, content: unknown): void {
  const safeName = sanitizeFilename(filename);
  const path = join(getPluginsDir(), safeName);
  writeFileSync(path, JSON.stringify(content, null, 2), 'utf-8');
}

/** プラグインに付随する任意のテキストファイル（.ts / .js 等）を保存。 */
export function savePluginTextFile(filename: string, body: string): void {
  const safeName = sanitizeFilename(filename);
  const path = join(getPluginsDir(), safeName);
  writeFileSync(path, body, 'utf-8');
}

/**
 * パストラバーサル対策。ファイル名に `/` `\` `..` 等が混じった場合は
 * すべて `_` に置換し、最終的に basename だけを採用する。
 */
function sanitizeFilename(filename: string): string {
  // 区切り文字をまず潰し、許可文字以外も `_` 化
  const normalized = filename.replace(/[\\/]/g, '_');
  return normalized.replace(/[^a-zA-Z0-9_.-]/g, '_');
}

/**
 * plugins ディレクトリ配下のテキストファイル (.js 等) を読み出す。
 * ランタイムロード用に renderer 側へファイル中身を返す目的。
 * 存在しない / 読み出し不可なら null。
 */
export function readPluginTextFile(filename: string): string | null {
  const safeName = sanitizeFilename(filename);
  const path = join(getPluginsDir(), safeName);
  if (!existsSync(path)) return null;
  try {
    return readFileSync(path, 'utf-8');
  } catch {
    return null;
  }
}

/**
 * 指定 manifest をアンインストール:
 * - manifest.files に列挙されたファイルを削除
 * - manifest 本体 (例: mermaid.json) を削除
 *
 * 戻り値: 実際に削除できたファイル名一覧 / 失敗（既に存在しない含む）一覧。
 */
export function uninstallPlugin(filename: string): {
  removed: string[];
  failed: string[];
} {
  const dir = getPluginsDir();
  const safeName = sanitizeFilename(filename);
  const manifestPath = join(dir, safeName);

  const removed: string[] = [];
  const failed: string[] = [];

  // manifest を読み込んで files[] を取得（manifest が無い場合はスキップ）
  let files: string[] = [];
  if (existsSync(manifestPath)) {
    try {
      const raw = readFileSync(manifestPath, 'utf-8');
      const json = JSON.parse(raw) as Record<string, unknown>;
      const arr = json.files;
      if (Array.isArray(arr)) {
        files = arr.filter((f): f is string => typeof f === 'string');
      }
    } catch {
      // 壊れた manifest でも本体削除には進む
    }
  }

  // 1) 付随ファイルを削除
  for (const f of files) {
    const path = join(dir, sanitizeFilename(f));
    try {
      if (existsSync(path)) {
        unlinkSync(path);
        removed.push(f);
      }
    } catch {
      failed.push(f);
    }
  }

  // 2) manifest 自身を削除
  try {
    if (existsSync(manifestPath)) {
      unlinkSync(manifestPath);
      removed.push(safeName);
    }
  } catch {
    failed.push(safeName);
  }

  return { removed, failed };
}
