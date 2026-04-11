/**
 * アプリ全体の設定値（レンダラ側で扱う型）。
 * SQLite には key/value で保存される。bool は 'true'/'false' 文字列にシリアライズ。
 */

import {
  DEFAULT_ENABLED_HIGHLIGHT_LANGS,
  SUPPORTED_HIGHLIGHT_LANGS,
} from './utils/highlight';

export type Theme = 'dark' | 'light';
export type SearchHistoryMode = 'reset' | 'persist';
export type SearchHistoryLimit = 100 | 1000;

export const SEARCH_HISTORY_LIMIT_OPTIONS: SearchHistoryLimit[] = [100, 1000];

export const SIDEBAR_WIDTH_MIN = 160;
export const SIDEBAR_WIDTH_MAX = 480;
export const SIDEBAR_WIDTH_DEFAULT = 240;

export interface AppSettings {
  /** UI 全体の配色テーマ */
  theme: Theme;
  /** 編集ツールバーにマークダウン挿入ボタン群（H1, B, I 等）を表示するか */
  showInsertButtons: boolean;
  /** 保護されたノートを解錠するための4桁パスワード */
  protectionPassword: string;
  /** 検索履歴の保存方式 */
  searchHistoryMode: SearchHistoryMode;
  /** 検索履歴の最大件数 */
  searchHistoryLimit: SearchHistoryLimit;
  /** サイドバーの幅 (px) */
  sidebarWidth: number;
  /** コードブロックのコピーボタンを常に表示するか（false ならホバー時のみ） */
  codeCopyAlwaysVisible: boolean;
  /** コードブロックに行番号を表示するか */
  codeShowLineNumbers: boolean;
  /**
   * シンタックスハイライトを有効化する言語の id 一覧。
   * 空配列なら全 fence ブロックがプレーンレンダリングになる。
   */
  enabledHighlightLangs: string[];
}

export const DEFAULT_SETTINGS: AppSettings = {
  theme: 'dark',
  showInsertButtons: true,
  protectionPassword: '1234',
  searchHistoryMode: 'reset',
  searchHistoryLimit: 100,
  sidebarWidth: SIDEBAR_WIDTH_DEFAULT,
  codeCopyAlwaysVisible: false,
  codeShowLineNumbers: false,
  enabledHighlightLangs: DEFAULT_ENABLED_HIGHLIGHT_LANGS,
};

/** SQLite の文字列レコードから AppSettings を組み立てる（未設定キーは既定値）。 */
export function parseSettings(raw: Record<string, string>): AppSettings {
  return {
    theme: parseTheme(raw['appearance.theme'], DEFAULT_SETTINGS.theme),
    showInsertButtons: parseBool(
      raw['editor.showInsertButtons'],
      DEFAULT_SETTINGS.showInsertButtons,
    ),
    protectionPassword: parsePassword(
      raw['protection.password'],
      DEFAULT_SETTINGS.protectionPassword,
    ),
    searchHistoryMode: parseHistoryMode(
      raw['search.historyMode'],
      DEFAULT_SETTINGS.searchHistoryMode,
    ),
    searchHistoryLimit: parseHistoryLimit(
      raw['search.historyLimit'],
      DEFAULT_SETTINGS.searchHistoryLimit,
    ),
    sidebarWidth: parseSidebarWidth(
      raw['ui.sidebarWidth'],
      DEFAULT_SETTINGS.sidebarWidth,
    ),
    codeCopyAlwaysVisible: parseBool(
      raw['codeBlock.copyAlwaysVisible'],
      DEFAULT_SETTINGS.codeCopyAlwaysVisible,
    ),
    codeShowLineNumbers: parseBool(
      raw['codeBlock.showLineNumbers'],
      DEFAULT_SETTINGS.codeShowLineNumbers,
    ),
    enabledHighlightLangs: parseHighlightLangs(
      raw['codeBlock.enabledHighlightLangs'],
      DEFAULT_SETTINGS.enabledHighlightLangs,
    ),
  };
}

/** AppSettings の特定キーから SQLite 用の (key, value) ペアを生成。 */
export function settingToRecord<K extends keyof AppSettings>(
  key: K,
  value: AppSettings[K],
): { key: string; value: string } {
  switch (key) {
    case 'theme':
      return { key: 'appearance.theme', value: String(value) };
    case 'showInsertButtons':
      return { key: 'editor.showInsertButtons', value: String(value) };
    case 'protectionPassword':
      return { key: 'protection.password', value: String(value) };
    case 'searchHistoryMode':
      return { key: 'search.historyMode', value: String(value) };
    case 'searchHistoryLimit':
      return { key: 'search.historyLimit', value: String(value) };
    case 'sidebarWidth':
      return { key: 'ui.sidebarWidth', value: String(value) };
    case 'codeCopyAlwaysVisible':
      return { key: 'codeBlock.copyAlwaysVisible', value: String(value) };
    case 'codeShowLineNumbers':
      return { key: 'codeBlock.showLineNumbers', value: String(value) };
    case 'enabledHighlightLangs':
      return {
        key: 'codeBlock.enabledHighlightLangs',
        value: JSON.stringify(value),
      };
    default:
      throw new Error(`unknown setting key: ${String(key)}`);
  }
}

/** 4桁の数字文字列かどうか判定 */
export function isValidProtectionPassword(v: string): boolean {
  return /^\d{4}$/.test(v);
}

function parseBool(v: string | undefined, fallback: boolean): boolean {
  if (v === 'true') return true;
  if (v === 'false') return false;
  return fallback;
}

function parseTheme(v: string | undefined, fallback: Theme): Theme {
  if (v === 'dark' || v === 'light') return v;
  return fallback;
}

function parsePassword(v: string | undefined, fallback: string): string {
  if (v && isValidProtectionPassword(v)) return v;
  return fallback;
}

function parseHistoryMode(
  v: string | undefined,
  fallback: SearchHistoryMode,
): SearchHistoryMode {
  if (v === 'reset' || v === 'persist') return v;
  return fallback;
}

function parseHistoryLimit(
  v: string | undefined,
  fallback: SearchHistoryLimit,
): SearchHistoryLimit {
  const n = Number(v);
  if (n === 100 || n === 1000) return n;
  return fallback;
}

function parseSidebarWidth(v: string | undefined, fallback: number): number {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  // min/max にクランプ
  return Math.min(SIDEBAR_WIDTH_MAX, Math.max(SIDEBAR_WIDTH_MIN, n));
}

function parseHighlightLangs(
  v: string | undefined,
  fallback: string[],
): string[] {
  if (!v) return fallback;
  try {
    const arr = JSON.parse(v);
    if (!Array.isArray(arr)) return fallback;
    const validIds = new Set(SUPPORTED_HIGHLIGHT_LANGS.map((l) => l.id));
    // 既知の id だけ通す（廃止されたエントリを掃除）
    return arr.filter(
      (s): s is string => typeof s === 'string' && validIds.has(s),
    );
  } catch {
    return fallback;
  }
}
