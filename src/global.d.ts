/**
 * preload (electron/preload.ts) で contextBridge 経由公開される API の型。
 */

export interface NoteMeta {
  id: string;
  title: string;
  folder: string;
  protected: boolean;
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
    patch: { title?: string; folder?: string },
  ): Promise<NoteMeta>;
  updateBody(id: string, body: string): Promise<void>;
  setProtected(id: string, isProtected: boolean): Promise<NoteMeta>;
  search(query: string): Promise<NoteMeta[]>;
  delete(id: string): Promise<void>;
}

export interface FoldersApi {
  list(): Promise<string[]>;
  create(path: string): Promise<void>;
  delete(path: string): Promise<void>;
}

export interface SettingsApi {
  getAll(): Promise<Record<string, string>>;
  set(key: string, value: string): Promise<void>;
}

export interface InkNelApi {
  onOpenPreferences(callback: () => void): () => void;
  notes: NotesApi;
  folders: FoldersApi;
  settings: SettingsApi;
}

declare global {
  interface Window {
    api: InkNelApi;
  }
}

export {};
