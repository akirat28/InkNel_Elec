/**
 * preload (electron/preload.ts) で contextBridge 経由公開される API の型。
 */

export interface NoteMeta {
  id: string;
  title: string;
  folder: string;
  protected: boolean;
  secret: boolean;
  tags: string[];
  createdAt: number;
  updatedAt: number;
}

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
  search(query: string): Promise<NoteMeta[]>;
  /** 全ノートをスキャンしてタグ → 該当ノート一覧を返す */
  listTags(): Promise<Array<{ tag: string; notes: NoteMeta[] }>>;
  delete(id: string): Promise<void>;
}

export interface FoldersApi {
  list(): Promise<string[]>;
  create(path: string): Promise<void>;
  delete(path: string): Promise<void>;
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
  onPrint(callback: () => void): () => void;
  notes: NotesApi;
  folders: FoldersApi;
  settings: SettingsApi;
  images: ImagesApi;
  attachments: AttachmentsApi;
  shell: ShellApi;
  media: MediaApi;
  template: TemplateApi;
  share: ShareApi;
}

declare global {
  interface Window {
    api: InkNelApi;
  }
}

export {};
