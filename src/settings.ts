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
export type AiProvider = 'general' | 'chatgpt' | 'claudeCode' | 'copilot';

export interface AiProviderOption {
  value: AiProvider;
  label: string;
}

export const AI_PROVIDER_OPTIONS: AiProviderOption[] = [
  { value: 'general', label: '一般的なAI' },
  { value: 'chatgpt', label: 'ChatGPT' },
  { value: 'claudeCode', label: 'ClaudeCode' },
  { value: 'copilot', label: 'Copilot' },
];

/**
 * 共有（クラウド同期）のプロバイダ。'none' は無効。
 * iCloud / Dropbox / Google Drive のいずれか一つを選択可能（複数不可）。
 */
export type ShareProvider = 'none' | 'icloud' | 'dropbox' | 'gdrive';

export interface ShareProviderOption {
  value: ShareProvider;
  label: string;
}

export const SHARE_PROVIDER_OPTIONS: ShareProviderOption[] = [
  { value: 'none', label: '無効' },
  { value: 'icloud', label: 'iCloud Drive' },
  { value: 'dropbox', label: 'Dropbox' },
  { value: 'gdrive', label: 'Google Drive' },
];

/** ノート本文のフォントファミリー（system はブラウザ既定の system-ui スタック） */
export type FontFamily = 'system' | 'sans' | 'serif' | 'mono';

export interface FontFamilyOption {
  value: FontFamily;
  label: string;
  /** 実際に CSS の font-family に適用する値 */
  cssValue: string;
}

export const FONT_FAMILY_OPTIONS: FontFamilyOption[] = [
  {
    value: 'system',
    label: 'システム',
    cssValue:
      'system-ui, -apple-system, "Helvetica Neue", Arial, sans-serif',
  },
  {
    value: 'sans',
    label: 'ゴシック',
    cssValue:
      '"Hiragino Sans", "Hiragino Kaku Gothic ProN", "Yu Gothic", "Noto Sans JP", Meiryo, sans-serif',
  },
  {
    value: 'serif',
    label: '明朝',
    cssValue:
      '"Hiragino Mincho ProN", "Hiragino Mincho Pro", "Yu Mincho", "Noto Serif JP", "MS PMincho", serif',
  },
  {
    value: 'mono',
    label: '等幅',
    cssValue: '"SF Mono", Menlo, Monaco, Consolas, "Courier New", monospace',
  },
];

/** ノート本文のフォントサイズ (px) */
export type FontSize = 12 | 13 | 14 | 15 | 16 | 17 | 18 | 19 | 20;
export const FONT_SIZE_OPTIONS: FontSize[] = [12, 13, 14, 15, 16, 17, 18, 19, 20];

/**
 * 日付挿入ボタンが使うフォーマット文字列。
 * トークンの意味は src/utils/dateFormat.ts を参照。
 * ここでは設定画面に並べる選択肢として固定リストを定義する。
 */
export interface DateFormatOption {
  /** 永続化される値（フォーマット文字列そのもの） */
  value: string;
  /** 設定画面に表示するプレビュー込みのラベル */
  label: string;
}

export const DATE_FORMAT_OPTIONS: DateFormatOption[] = [
  { value: 'YYYY-MM-DD', label: 'YYYY-MM-DD（例: 2026-04-12）' },
  { value: 'YYYY/MM/DD', label: 'YYYY/MM/DD（例: 2026/04/12）' },
  { value: 'YYYY年M月D日', label: 'YYYY年M月D日（例: 2026年4月12日）' },
  { value: 'YYYY年MM月DD日', label: 'YYYY年MM月DD日（例: 2026年04月12日）' },
  { value: 'M/D', label: 'M/D（例: 4/12）' },
  { value: 'YYYY-MM-DD HH:mm', label: 'YYYY-MM-DD HH:mm（例: 2026-04-12 14:30）' },
  { value: 'YYYY/MM/DD HH:mm', label: 'YYYY/MM/DD HH:mm（例: 2026/04/12 14:30）' },
];

export const DEFAULT_DATE_FORMAT = 'YYYY-MM-DD';

export const SEARCH_HISTORY_LIMIT_OPTIONS: SearchHistoryLimit[] = [100, 1000];

export const SIDEBAR_WIDTH_MIN = 160;
export const SIDEBAR_WIDTH_MAX = 480;
export const SIDEBAR_WIDTH_DEFAULT = 240;

export interface AppSettings {
  /** UI 全体の配色テーマ */
  theme: Theme;
  /** メイン画面（ノート本文）のフォントファミリー */
  fontFamily: FontFamily;
  /** メイン画面（ノート本文）のフォントサイズ (px) */
  fontSize: FontSize;
  /** サイドメニュー（ファイル一覧・検索・タグ）のフォントファミリー */
  sidebarFontFamily: FontFamily;
  /** サイドメニュー（ファイル一覧・検索・タグ）のフォントサイズ (px) */
  sidebarFontSize: FontSize;
  /** 日付挿入ボタンが使うフォーマット文字列 */
  dateFormat: string;
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
  /** 共有プロバイダ。'none' で同期無効（UI からは廃止、互換のため型は維持） */
  shareProvider: ShareProvider;
  /**
   * ファイル保存先フォルダの絶対パス。空文字列なら既定の userData を使う。
   * notes/, images/, attachments/ がこの直下に作られる。
   */
  storagePath: string;
  /** テンプレートとして使うフォルダ名（サイドバーの仮想フォルダ） */
  templateFolder: string;
  /** ノート変換に使う AI プロバイダ */
  aiProvider: AiProvider;
  /** AI 接続用トークン */
  aiToken: string;
  /** AI API のエンドポイント。空ならプロバイダ既定値 */
  aiEndpoint: string;
  /** AI モデル名。空ならプロバイダ既定値 */
  aiModel: string;
  /**
   * 有効化されているプラグイン ID の配列。
   * `src/plugins/<id>.ts` が存在し、かつここに含まれていれば有効。
   * 配列に未知の ID が混じっていても registry 側で無視される。
   */
  enabledPlugins: string[];
  /**
   * ユーザーが「削除」した ID。バンドル版が残っていても表示・実行ともに
   * スキップされる（再 DL すると自動でこのリストから外れる）。
   */
  removedPlugins: string[];
  /**
   * 「インポート」されたプラグイン ID の一覧。
   * DL = ファイル保存だけで不活性。インポートで初めて runtime registry に登録される。
   * アプリ起動時にここに含まれる ID のみ自動的にロードする。
   */
  importedPlugins: string[];
}

export const DEFAULT_SETTINGS: AppSettings = {
  theme: 'dark',
  fontFamily: 'system',
  fontSize: 15,
  sidebarFontFamily: 'system',
  sidebarFontSize: 13,
  dateFormat: DEFAULT_DATE_FORMAT,
  showInsertButtons: true,
  protectionPassword: '1234',
  searchHistoryMode: 'reset',
  searchHistoryLimit: 100,
  sidebarWidth: SIDEBAR_WIDTH_DEFAULT,
  codeCopyAlwaysVisible: false,
  codeShowLineNumbers: false,
  enabledHighlightLangs: DEFAULT_ENABLED_HIGHLIGHT_LANGS,
  shareProvider: 'none',
  storagePath: '',
  templateFolder: 'template',
  aiProvider: 'general',
  aiToken: '',
  aiEndpoint: '',
  aiModel: '',
  enabledPlugins: [],
  removedPlugins: [],
  importedPlugins: [],
};

/** SQLite の文字列レコードから AppSettings を組み立てる（未設定キーは既定値）。 */
export function parseSettings(raw: Record<string, string>): AppSettings {
  return {
    theme: parseTheme(raw['appearance.theme'], DEFAULT_SETTINGS.theme),
    fontFamily: parseFontFamily(
      raw['appearance.fontFamily'],
      DEFAULT_SETTINGS.fontFamily,
    ),
    fontSize: parseFontSize(
      raw['appearance.fontSize'],
      DEFAULT_SETTINGS.fontSize,
    ),
    sidebarFontFamily: parseFontFamily(
      raw['appearance.sidebarFontFamily'],
      DEFAULT_SETTINGS.sidebarFontFamily,
    ),
    sidebarFontSize: parseFontSize(
      raw['appearance.sidebarFontSize'],
      DEFAULT_SETTINGS.sidebarFontSize,
    ),
    dateFormat: parseDateFormat(
      raw['editor.dateFormat'],
      DEFAULT_SETTINGS.dateFormat,
    ),
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
    shareProvider: parseShareProvider(
      raw['share.provider'],
      DEFAULT_SETTINGS.shareProvider,
    ),
    storagePath: typeof raw['storage.path'] === 'string' ? raw['storage.path'] : DEFAULT_SETTINGS.storagePath,
    templateFolder: raw['template.folder']?.trim() || DEFAULT_SETTINGS.templateFolder,
    aiProvider: parseAiProvider(
      raw['ai.provider'],
      DEFAULT_SETTINGS.aiProvider,
    ),
    aiToken: typeof raw['ai.token'] === 'string' ? raw['ai.token'] : DEFAULT_SETTINGS.aiToken,
    aiEndpoint: typeof raw['ai.endpoint'] === 'string' ? raw['ai.endpoint'] : DEFAULT_SETTINGS.aiEndpoint,
    aiModel: typeof raw['ai.model'] === 'string' ? raw['ai.model'] : DEFAULT_SETTINGS.aiModel,
    enabledPlugins: parseEnabledPlugins(
      raw['plugin.enabled'],
      DEFAULT_SETTINGS.enabledPlugins,
    ),
    removedPlugins: parseEnabledPlugins(
      raw['plugin.removed'],
      DEFAULT_SETTINGS.removedPlugins,
    ),
    importedPlugins: parseEnabledPlugins(
      raw['plugin.imported'],
      DEFAULT_SETTINGS.importedPlugins,
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
    case 'fontFamily':
      return { key: 'appearance.fontFamily', value: String(value) };
    case 'fontSize':
      return { key: 'appearance.fontSize', value: String(value) };
    case 'sidebarFontFamily':
      return { key: 'appearance.sidebarFontFamily', value: String(value) };
    case 'sidebarFontSize':
      return { key: 'appearance.sidebarFontSize', value: String(value) };
    case 'dateFormat':
      return { key: 'editor.dateFormat', value: String(value) };
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
    case 'shareProvider':
      return { key: 'share.provider', value: String(value) };
    case 'storagePath':
      return { key: 'storage.path', value: String(value) };
    case 'templateFolder':
      return { key: 'template.folder', value: String(value) };
    case 'aiProvider':
      return { key: 'ai.provider', value: String(value) };
    case 'aiToken':
      return { key: 'ai.token', value: String(value) };
    case 'aiEndpoint':
      return { key: 'ai.endpoint', value: String(value) };
    case 'aiModel':
      return { key: 'ai.model', value: String(value) };
    case 'enabledPlugins':
      return { key: 'plugin.enabled', value: JSON.stringify(value) };
    case 'removedPlugins':
      return { key: 'plugin.removed', value: JSON.stringify(value) };
    case 'importedPlugins':
      return { key: 'plugin.imported', value: JSON.stringify(value) };
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

function parseFontFamily(
  v: string | undefined,
  fallback: FontFamily,
): FontFamily {
  if (FONT_FAMILY_OPTIONS.some((o) => o.value === v)) {
    return v as FontFamily;
  }
  return fallback;
}

function parseFontSize(v: string | undefined, fallback: FontSize): FontSize {
  const n = Number(v);
  if (Number.isFinite(n) && (FONT_SIZE_OPTIONS as number[]).includes(n)) {
    return n as FontSize;
  }
  return fallback;
}

function parseDateFormat(v: string | undefined, fallback: string): string {
  // 既知のプリセットのみ通す（不正な値を弾く）
  if (v && DATE_FORMAT_OPTIONS.some((o) => o.value === v)) return v;
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

function parseShareProvider(
  v: string | undefined,
  fallback: ShareProvider,
): ShareProvider {
  if (
    v === 'none' ||
    v === 'icloud' ||
    v === 'dropbox' ||
    v === 'gdrive'
  ) {
    return v;
  }
  return fallback;
}

function parseAiProvider(
  v: string | undefined,
  fallback: AiProvider,
): AiProvider {
  if (v === 'general' || v === 'chatgpt' || v === 'claudeCode' || v === 'copilot') {
    return v;
  }
  return fallback;
}

function parseEnabledPlugins(
  v: string | undefined,
  fallback: string[],
): string[] {
  if (!v) return fallback;
  try {
    const arr = JSON.parse(v);
    if (!Array.isArray(arr)) return fallback;
    return arr.filter((s): s is string => typeof s === 'string');
  } catch {
    return fallback;
  }
}
