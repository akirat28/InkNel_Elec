import { contextBridge, ipcRenderer } from 'electron';

export interface NoteMeta {
  id: string;
  title: string;
  folder: string;
  protected: boolean;
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
      patch: { title?: string; folder?: string },
    ): Promise<NoteMeta> {
      return ipcRenderer.invoke('notes:update-meta', id, patch);
    },
    updateBody(id: string, body: string): Promise<void> {
      return ipcRenderer.invoke('notes:update-body', id, body);
    },
    setProtected(id: string, isProtected: boolean): Promise<NoteMeta> {
      return ipcRenderer.invoke('notes:set-protected', id, isProtected);
    },
    search(query: string): Promise<NoteMeta[]> {
      return ipcRenderer.invoke('notes:search', query);
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
  },

  settings: {
    getAll(): Promise<Record<string, string>> {
      return ipcRenderer.invoke('settings:getAll');
    },
    set(key: string, value: string): Promise<void> {
      return ipcRenderer.invoke('settings:set', key, value);
    },
  },
});
