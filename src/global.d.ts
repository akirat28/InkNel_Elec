/**
 * preload (electron/preload.ts) で contextBridge 経由公開される API の型。
 */

export interface NoteMeta {
  id: string;
  title: string;
  folder: string;
  protected: boolean;
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

export interface InkNelApi {
  onOpenPreferences(callback: () => void): () => void;
  notes: NotesApi;
  folders: FoldersApi;
  settings: SettingsApi;
  images: ImagesApi;
  attachments: AttachmentsApi;
  shell: ShellApi;
  media: MediaApi;
}

declare global {
  interface Window {
    api: InkNelApi;
  }
}

export {};
