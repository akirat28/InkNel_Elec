import { ipcMain } from 'electron';
import { randomUUID } from 'node:crypto';
import {
  listNotes,
  getNote,
  insertNote,
  updateNoteMeta,
  setNoteProtected,
  touchNote,
  deleteNote,
  type NoteMeta,
} from './db/notes';
import { listFolders, insertFolder, deleteFolder } from './db/folders';
import { getAllSettings, setSetting } from './db/settings';
import { readBody, writeBody, deleteBody } from './storage/notesFiles';

/** "a/b/c" 形式に正規化（前後スラッシュ除去・連続スラッシュ畳み込み・空セグメント除去） */
function normalizeFolderPath(input: string): string {
  return input
    .split('/')
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
    .join('/');
}

export function registerIpc(): void {
  ipcMain.handle('notes:list', (): NoteMeta[] => {
    return listNotes();
  });

  ipcMain.handle(
    'notes:create',
    (_e, input: { title?: string; folder?: string; body?: string }): NoteMeta => {
      const now = Date.now();
      const meta: NoteMeta = {
        id: randomUUID(),
        title: input.title?.trim() || '無題',
        folder: input.folder ?? '',
        protected: false,
        createdAt: now,
        updatedAt: now,
      };
      insertNote(meta);
      writeBody(meta.id, input.body ?? '');
      return meta;
    },
  );

  ipcMain.handle('notes:read-body', (_e, id: string): string => {
    return readBody(id);
  });

  ipcMain.handle(
    'notes:update-meta',
    (_e, id: string, patch: { title?: string; folder?: string }): NoteMeta => {
      return updateNoteMeta(id, patch);
    },
  );

  ipcMain.handle(
    'notes:update-body',
    (_e, id: string, body: string): void => {
      const note = getNote(id);
      if (!note) throw new Error(`note not found: ${id}`);
      writeBody(id, body);
      touchNote(id);
    },
  );

  ipcMain.handle(
    'notes:set-protected',
    (_e, id: string, isProtected: boolean): NoteMeta => {
      return setNoteProtected(id, isProtected);
    },
  );

  ipcMain.handle('notes:search', (_e, query: string): NoteMeta[] => {
    const q = query.trim();
    if (!q) return [];

    const all = listNotes();
    const lower = q.toLowerCase();

    // 1) タイトル一致を先に拾う
    const titleMatched: NoteMeta[] = [];
    const titleMatchedIds = new Set<string>();
    for (const note of all) {
      if (note.title.toLowerCase().includes(lower)) {
        titleMatched.push(note);
        titleMatchedIds.add(note.id);
      }
    }

    // 2) 本文一致を追加（タイトルで既にヒットした分は除外）
    const bodyMatched: NoteMeta[] = [];
    for (const note of all) {
      if (titleMatchedIds.has(note.id)) continue;
      try {
        const body = readBody(note.id);
        if (body.toLowerCase().includes(lower)) {
          bodyMatched.push(note);
        }
      } catch {
        // 読み取り失敗は無視
      }
    }

    return [...titleMatched, ...bodyMatched];
  });

  ipcMain.handle('notes:delete', (_e, id: string): void => {
    const note = getNote(id);
    if (!note) return;
    if (note.protected) {
      throw new Error('保護されているノートは削除できません');
    }
    deleteNote(id);
    deleteBody(id);
  });

  // ----- folders -----
  ipcMain.handle('folders:list', (): string[] => {
    return listFolders();
  });

  ipcMain.handle('folders:create', (_e, path: string): void => {
    const normalized = normalizeFolderPath(path);
    if (!normalized) return;
    insertFolder(normalized);
  });

  ipcMain.handle('folders:delete', (_e, path: string): void => {
    const normalized = normalizeFolderPath(path);
    if (!normalized) return;
    deleteFolder(normalized);
  });

  // ----- settings -----
  ipcMain.handle('settings:getAll', (): Record<string, string> => {
    return getAllSettings();
  });

  ipcMain.handle('settings:set', (_e, key: string, value: string): void => {
    setSetting(key, value);
  });
}
