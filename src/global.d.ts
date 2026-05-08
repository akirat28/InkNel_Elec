/**
 * preload (electron/preload.ts) で contextBridge 経由公開される API の型。
 */

import type { NoteMeta } from '../electron/db/notes';

export type { NoteMeta };

export interface NotesApi {
  list(): Promise<NoteMeta[]>;
  create(input: {
    title?: string;
    folder?: string;
    body?: string;
  }): Promise<NoteMeta>;
  readBody(id: string): Promise<string>;
  updateMeta(
    id: string,
    patch: { title?: string; folder?: string; tags?: string[] },
  ): Promise<NoteMeta>;
  updateBody(id: string, body: string): Promise<void>;
  setProtected(id: string, isProtected: boolean): Promise<NoteMeta>;
  setSecret(id: string, isSecret: boolean): Promise<NoteMeta>;
  addLink(id: string, linkedNoteId: string): Promise<NoteMeta>;
  removeLink(id: string, linkedNoteId: string): Promise<NoteMeta>;
  search(query: string): Promise<NoteMeta[]>;
  /** 全ノートをスキャンしてタグ → 該当ノート一覧を返す */
  listTags(): Promise<Array<{ tag: string; notes: NoteMeta[] }>>;
  /** ダイアログで選んだ .md ファイルの中身を読み込んで返す */
  importMd(): Promise<Array<{ name: string; body: string }>>;
  /** ダイアログで選んだディレクトリ配下の .md を再帰的に読み込んで返す */
  importDir(): Promise<
    Array<{ name: string; body: string; subFolder: string }>
  >;
  delete(id: string): Promise<void>;
}

export interface FoldersApi {
  list(): Promise<string[]>;
  create(path: string): Promise<void>;
  delete(path: string): Promise<void>;
  /** フォルダを配下のノート・サブフォルダごと丸ごと削除 */
  deleteRecursive(path: string): Promise<{ deletedCount: number }>;
  /** フォルダパスを書き換え。配下の全ノートと全サブフォルダを一括更新 */
  rename(oldPath: string, newPath: string): Promise<void>;
}

export interface SettingsApi {
  getAll(): Promise<Record<string, string>>;
  set(key: string, value: string): Promise<void>;
}

export interface ImagesApi {
  /** 画像バイナリを保存し、ファイル名（hash.ext）を返す */
  save(data: ArrayBuffer, ext: string): Promise<string>;
  /** ファイルが存在するか確認 */
  exists(filename: string): Promise<boolean>;
}

export interface AttachmentsApi {
  /** 添付ファイルバイナリを保存し、ファイル名（hash.ext）を返す */
  save(data: ArrayBuffer, ext: string): Promise<string>;
  /** ファイルが存在するか確認 */
  exists(filename: string): Promise<boolean>;
  /** OS の既定アプリで開く */
  open(filename: string): Promise<void>;
}

export interface ShellApi {
  /** 外部 URL を既定ブラウザで開く（http/https のみ） */
  openExternal(url: string): Promise<void>;
}

export interface FilesApi {
  /** 現在のノート本文を Markdown として保存。true なら成功、false ならキャンセル */
  exportMarkdown(defaultName: string, body: string): Promise<boolean>;
  /** 現在のウィンドウ描画を PDF として保存 */
  exportPdf(defaultName: string): Promise<boolean>;
}

export interface AppControlApi {
  /**
   * アプリを完全初期化する（全データ削除 + 再起動）。
   * UI 側で破壊的操作の確認を取った後に呼ぶこと。
   */
  resetAll(): Promise<void>;
}

export interface StorageApi {
  /** 現在のファイル保存ルート（既定: userData、または設定で指定したフォルダ） */
  getRoot(): Promise<string>;
  /** フォルダ選択ダイアログを開く。キャンセル時は null */
  chooseFolder(): Promise<string | null>;
  /** 保存先フォルダの内容をスキャンして DB との差分を返す */
  scan(): Promise<{
    storageRoot: string;
    dbNoteCount: number;
    diskFileCount: number;
    missingOnDisk: string[];
    extraOnDisk: string[];
  }>;
  /** DB ↔ disk の同期を実行し、書き出し / 取り込みの件数を返す */
  sync(): Promise<{ saved: number; imported: number }>;
  /** DB の全ノートを保存先フォルダに強制上書きする */
  overwriteAll(): Promise<{ written: number; failed: number }>;
}

export interface UiApi {
  /**
   * 汎用の OS ネイティブコンテキストメニュー。
   * 選ばれた item の id を返す（キャンセル時は null）。
   */
  showContextMenu(opts: {
    position?: { x: number; y: number };
    items: Array<{
      id?: string;
      label?: string;
      enabled?: boolean;
      separator?: boolean;
    }>;
  }): Promise<string | null>;
  /** OS ネイティブのノート操作メニューを指定位置にポップアップする */
  showNoteMenu(position: { x: number; y: number }): Promise<void>;
  onExportPdf(callback: () => void): () => void;
  onExportMarkdown(callback: () => void): () => void;
}

export interface MediaApi {
  /** 候補のうち、どのノートからも参照されていないファイルを削除 */
  gc(candidates: {
    images: string[];
    attachments: string[];
  }): Promise<{ deletedImages: string[]; deletedAttachments: string[] }>;
}

export type ShareProviderId = 'none' | 'icloud' | 'dropbox' | 'gdrive';

export interface ShareProviderInfo {
  id: 'icloud' | 'dropbox' | 'gdrive';
  label: string;
  path: string | null;
  available: boolean;
}

export interface ShareStatus {
  provider: ShareProviderId;
  available: boolean;
  path: string | null;
  /** 最終同期時刻 (epoch ms)。0 は未同期 */
  lastSync: number;
  /** クラウド側のマニフェストに載っているノート数 */
  cloudNoteCount: number;
}

export interface ShareSyncResult {
  pushed: number;
  pulled: number;
  unchanged: number;
  total: number;
  /** メディア (images + attachments) の同期件数 */
  mediaPushed: number;
  mediaPulled: number;
  lastSync: number;
}

/** 同期進捗イベント */
export type ShareSyncProgress =
  | { phase: 'start'; total: number }
  | { phase: 'push'; current: number; total: number; noteTitle: string }
  | { phase: 'pull'; current: number; total: number; noteTitle: string }
  | { phase: 'skip'; current: number; total: number; noteTitle: string }
  | { phase: 'media'; kind: 'images' | 'attachments'; pushed: number; pulled: number; total: number }
  | { phase: 'finalizing'; total: number }
  | { phase: 'done'; result: ShareSyncResult };

export interface TemplateEntry {
  /** テンプレート名（ノートの title） */
  name: string;
  /** ノート ID */
  noteId: string;
}

export interface TemplateApi {
  /** folder='template' のノート一覧を返す */
  list(): Promise<TemplateEntry[]>;
  /** 指定ノートの本文を返す（テンプレートとして挿入用） */
  read(noteId: string): Promise<string>;
}

export type AiAction =
  | 'summarizeByHeading'
  | 'organizeBullets'
  | 'improveCodeBlocks'
  | 'formatTables'
  | 'convertHtmlToMarkdown';

export interface AiTransformInput {
  provider: 'general' | 'chatgpt' | 'claudeCode' | 'copilot';
  token: string;
  endpoint: string;
  model: string;
  action: AiAction;
  content: string;
}

export interface AiChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface AiChatInput {
  provider: 'general' | 'chatgpt' | 'claudeCode' | 'copilot';
  token: string;
  endpoint: string;
  model: string;
  messages: AiChatMessage[];
  noteContext?: {
    title: string;
    body: string;
    relatedNotes?: Array<{
      title: string;
      body: string;
    }>;
  };
}

export interface AiApi {
  transform(input: AiTransformInput): Promise<string>;
  chat(input: AiChatInput): Promise<string>;
}

export interface ShareApi {
  /** iCloud / Dropbox / Google Drive のフォルダ検出結果を返す */
  detectProviders(): Promise<ShareProviderInfo[]>;
  /** 指定プロバイダの同期状態を返す */
  getStatus(provider: ShareProviderId): Promise<ShareStatus>;
  /**
   * 指定ノートについて PC とクラウドのタイムスタンプを比較し双方向同期。
   * 'pulled' = クラウドから取得 / 'pushed' = PC からクラウドへ /
   * 'same' = 同一 / 'skip' = プロバイダ無効
   */
  checkNote(
    provider: ShareProviderId,
    noteId: string,
  ): Promise<'pulled' | 'pushed' | 'same' | 'skip'>;
  /** 指定プロバイダのクラウドフォルダと双方向同期を実行 */
  sync(provider: ShareProviderId): Promise<ShareSyncResult>;
  /** 同期中の進捗イベントを購読。返り値は購読解除関数 */
  onProgress(callback: (ev: ShareSyncProgress) => void): () => void;
}

export interface InkNelApi {
  onOpenPreferences(callback: () => void): () => void;
  openPreferencesWindow(): Promise<void>;
  closeCurrentWindow(): Promise<void>;
  onSettingsChanged(callback: () => void): () => void;
  onPrint(callback: () => void): () => void;
  onCreateNote(callback: () => void): () => void;
  onFind(callback: () => void): () => void;
  onReplace(callback: () => void): () => void;
  onImportMd(callback: () => void): () => void;
  onImportDir(callback: () => void): () => void;
  notes: NotesApi;
  folders: FoldersApi;
  settings: SettingsApi;
  images: ImagesApi;
  attachments: AttachmentsApi;
  shell: ShellApi;
  files: FilesApi;
  storage: StorageApi;
  app: AppControlApi;
  ui: UiApi;
  media: MediaApi;
  template: TemplateApi;
  ai: AiApi;
  share: ShareApi;
}

declare global {
  interface Window {
    api: InkNelApi;
  }
}

export {};
