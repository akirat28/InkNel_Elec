import { contextBridge, ipcRenderer } from 'electron';

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

contextBridge.exposeInMainWorld('api', {
  /** メインプロセスの「設定」メニュー押下を購読する。返り値は購読解除関数。 */
  onOpenPreferences(callback: () => void): () => void {
    const handler = () => callback();
    ipcRenderer.on('menu:open-preferences', handler);
    return () => ipcRenderer.removeListener('menu:open-preferences', handler);
  },

  /** メインプロセスの「印刷」メニュー押下を購読する。返り値は購読解除関数。 */
  onPrint(callback: () => void): () => void {
    const handler = () => callback();
    ipcRenderer.on('menu:print', handler);
    return () => ipcRenderer.removeListener('menu:print', handler);
  },

  notes: {
    list(): Promise<NoteMeta[]> {
      return ipcRenderer.invoke('notes:list');
    },
    create(input: {
      title?: string;
      folder?: string;
      body?: string;
    }): Promise<NoteMeta> {
      return ipcRenderer.invoke('notes:create', input);
    },
    readBody(id: string): Promise<string> {
      return ipcRenderer.invoke('notes:read-body', id);
    },
    updateMeta(
      id: string,
      patch: { title?: string; folder?: string; tags?: string[] },
    ): Promise<NoteMeta> {
      return ipcRenderer.invoke('notes:update-meta', id, patch);
    },
    updateBody(id: string, body: string): Promise<void> {
      return ipcRenderer.invoke('notes:update-body', id, body);
    },
    setProtected(id: string, isProtected: boolean): Promise<NoteMeta> {
      return ipcRenderer.invoke('notes:set-protected', id, isProtected);
    },
    setSecret(id: string, isSecret: boolean): Promise<NoteMeta> {
      return ipcRenderer.invoke('notes:set-secret', id, isSecret);
    },
    search(query: string): Promise<NoteMeta[]> {
      return ipcRenderer.invoke('notes:search', query);
    },
    listTags(): Promise<Array<{ tag: string; notes: NoteMeta[] }>> {
      return ipcRenderer.invoke('notes:list-tags');
    },
    delete(id: string): Promise<void> {
      return ipcRenderer.invoke('notes:delete', id);
    },
  },

  folders: {
    list(): Promise<string[]> {
      return ipcRenderer.invoke('folders:list');
    },
    create(path: string): Promise<void> {
      return ipcRenderer.invoke('folders:create', path);
    },
    delete(path: string): Promise<void> {
      return ipcRenderer.invoke('folders:delete', path);
    },
    rename(oldPath: string, newPath: string): Promise<void> {
      return ipcRenderer.invoke('folders:rename', oldPath, newPath);
    },
  },

  settings: {
    getAll(): Promise<Record<string, string>> {
      return ipcRenderer.invoke('settings:getAll');
    },
    set(key: string, value: string): Promise<void> {
      return ipcRenderer.invoke('settings:set', key, value);
    },
  },

  images: {
    save(data: ArrayBuffer, ext: string): Promise<string> {
      return ipcRenderer.invoke('images:save', data, ext);
    },
    exists(filename: string): Promise<boolean> {
      return ipcRenderer.invoke('images:exists', filename);
    },
  },

  attachments: {
    save(data: ArrayBuffer, ext: string): Promise<string> {
      return ipcRenderer.invoke('attachments:save', data, ext);
    },
    exists(filename: string): Promise<boolean> {
      return ipcRenderer.invoke('attachments:exists', filename);
    },
    open(filename: string): Promise<void> {
      return ipcRenderer.invoke('attachments:open', filename);
    },
  },

  shell: {
    openExternal(url: string): Promise<void> {
      return ipcRenderer.invoke('shell:open-external', url);
    },
  },

  media: {
    /** 候補のうち、どのノートからも参照されていないファイルを削除 */
    gc(candidates: {
      images: string[];
      attachments: string[];
    }): Promise<{ deletedImages: string[]; deletedAttachments: string[] }> {
      return ipcRenderer.invoke('media:gc', candidates);
    },
  },
});
